import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertRequiredPowerPointsRetained,
  verifyRequiredPowerArtifacts,
} from './required-power-publication';

const golden = path.resolve(
  import.meta.dirname,
  '../../../../docs/fixtures/powerx-manifest-v2/artifacts',
);
const source = { runId: 123, runAttempt: 1, headSha: 'b'.repeat(40) };
const dirs: string[] = [];
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'powerx-contract-'));
  dirs.push(dir);
  fs.cpSync(golden, dir, { recursive: true });
  return dir;
}
function json(dir: string, file: string): any {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
}
function write(dir: string, file: string, value: unknown) {
  fs.writeFileSync(path.join(dir, file), JSON.stringify(value));
}
const manifestPath = 'required-power-sweep-manifest/sweep_manifest.json';
const benchmarkPath = 'bmk_agentic_golden/agg.json';
const auditPath = 'agentic_golden/power_validation.json';
function changeManifest(dir: string, edit: (manifest: any) => void) {
  const manifest = json(dir, manifestPath);
  edit(manifest);
  write(dir, manifestPath, manifest);
}
function changeArtifact(dir: string, file: string, edit: (value: any) => void) {
  const value = json(dir, file);
  edit(value);
  write(dir, file, value);
  changeManifest(dir, (manifest) => {
    for (const point of manifest.points)
      for (const artifact of point.artifacts)
        if (artifact.path === file)
          artifact.sha256 = createHash('sha256')
            .update(fs.readFileSync(path.join(dir, file)))
            .digest('hex');
  });
}
function multinodeFixture() {
  const dir = fixture();
  const extras: Record<string, unknown> = {
    'power_audit_golden/power/samples.csv':
      'timestamp_unix,hostname,gpu_uuid,power_w\n1700000000,prefill,GPU-p,200\n',
    'power_audit_golden/power/manifest.json': { status: 'complete', publication_valid: true },
    'power_audit_golden/power/windows/point.json': {
      benchmark_start_time_unix: 1700000000,
      benchmark_end_time_unix: 1700000002,
    },
  };
  for (const [file, value] of Object.entries(extras)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(
      path.join(dir, file),
      typeof value === 'string' ? value : JSON.stringify(value),
    );
  }
  changeArtifact(dir, benchmarkPath, (row) =>
    Object.assign(row, {
      disagg: true,
      is_multinode: true,
      num_gpus: 2,
      num_prefill_gpu: 1,
      num_decode_gpu: 1,
      prefill_gpu_energy_j: 400,
      decode_gpu_energy_j: 600,
      prefill_joules_per_input_token: 1,
      decode_joules_per_output_token: 1,
    }),
  );
  changeArtifact(dir, auditPath, (audit) =>
    Object.assign(audit, {
      expected_gpu_count: 2,
      observed_gpu_count: 2,
      per_gpu_energy_j: { 'prefill/GPU-p': 400, 'decode/GPU-d': 600 },
      per_gpu_role: { 'prefill/GPU-p': 'prefill', 'decode/GPU-d': 'decode' },
    }),
  );
  changeManifest(dir, (manifest) => {
    const entry = manifest.matrix.single_node.agentic[0];
    Object.assign(entry, { disagg: true, 'num-gpus': 2, 'node-count': 2 });
    manifest.matrix = { single_node: {}, multi_node: { agentic: [entry] } };
    const point = manifest.points[0];
    Object.assign(point.topology, {
      disagg: true,
      is_multinode: true,
      num_gpus: 2,
      num_prefill_gpu: 1,
      num_decode_gpu: 1,
    });
    point.devices = [
      { node: 'prefill', gpu_uuid: 'GPU-p', role: 'prefill', energy_j: 400 },
      { node: 'decode', gpu_uuid: 'GPU-d', role: 'decode', energy_j: 600 },
    ];
    for (const file of Object.keys(extras))
      point.artifacts.push({
        path: file,
        sha256: createHash('sha256')
          .update(fs.readFileSync(path.join(dir, file)))
          .digest('hex'),
        validation_state: 'valid',
      });
  });
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('required power publication contract', () => {
  it('accepts the shared producer golden fixture and an earlier declared attempt of the same head', () => {
    expect(verifyRequiredPowerArtifacts(golden, source, true)).toMatchObject([
      { conc: 1, benchmarkType: 'agentic_traces', metrics: { total_gpu_energy_j: 1000 } },
    ]);
    expect(verifyRequiredPowerArtifacts(golden, { ...source, runAttempt: 2 }, true)).toHaveLength(
      1,
    );
  });
  it('fails missing required manifests even when changelog metadata is also missing', () => {
    const dir = fixture();
    fs.rmSync(path.join(dir, 'required-power-sweep-manifest'), { recursive: true });
    expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow('sweep manifest missing');
    fs.rmSync(path.join(dir, 'changelog-metadata'), { recursive: true });
    expect(() => verifyRequiredPowerArtifacts(dir, source, true)).toThrow('sweep manifest missing');
    expect(verifyRequiredPowerArtifacts(dir, source)).toEqual([]);
  });
  it.each([undefined, 1, 3, '2'])(
    'rejects missing or incompatible manifest version %s',
    (version) => {
      const dir = fixture();
      changeManifest(dir, (manifest) => {
        manifest['schema-version'] = version;
      });
      expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow('schema-version');
    },
  );
  it.each(['agentic_golden/gpu_metrics.csv', auditPath, benchmarkPath])(
    'rejects missing required artifact %s',
    (file) => {
      const dir = fixture();
      fs.unlinkSync(path.join(dir, file));
      expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow('missing required artifact');
    },
  );
  it('rejects hash mismatches and explicit invalid evidence', () => {
    const dir = fixture();
    fs.appendFileSync(path.join(dir, 'agentic_golden/gpu_metrics.csv'), '\n');
    expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow('hash');
    const invalid = fixture();
    changeManifest(invalid, (manifest) => {
      manifest.points[0].artifacts[0].validation_state = 'invalid';
    });
    expect(() => verifyRequiredPowerArtifacts(invalid, source)).toThrow('validation');
  });
  it.each([undefined, null, 0, -1, '1000'])(
    'rejects missing, invalid and measured nonpositive energy separately: %s',
    (energy) => {
      const dir = fixture();
      changeArtifact(dir, benchmarkPath, (rows) => {
        rows.total_gpu_energy_j = energy;
      });
      expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow(
        'total_gpu_energy_j must be finite and positive',
      );
    },
  );
  it('does not replace canonical AgentX users with a conflicting raw conc', () => {
    const dir = fixture();
    changeArtifact(dir, benchmarkPath, (rows) => {
      rows.conc = 1;
      rows.users = 2;
    });
    expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow('missing benchmark point');
  });
  it.each(['model', 'hardware', 'framework', 'precision'])(
    'rejects substituted %s identity',
    (field) => {
      const dir = fixture();
      changeManifest(dir, (manifest) => {
        manifest.points[0].identity[field] = 'other';
      });
      expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow(`${field} identity differs`);
    },
  );
  it('rejects absent physical GPU, duplicate physical GPU, and changed measurement boundaries', () => {
    for (const edit of [
      (point: any) => {
        point.devices = [];
      },
      (point: any) => {
        point.devices[0].gpu_uuid = '0';
      },
      (point: any) => {
        point.measurement_window.end_time_unix += 1;
      },
    ]) {
      const dir = fixture();
      changeManifest(dir, (manifest) => edit(manifest.points[0]));
      expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow('Required power:');
    }
  });
  it('requires both prefill and decode physical evidence and matching role energy', () => {
    const dir = multinodeFixture();
    expect(verifyRequiredPowerArtifacts(dir, source)).toHaveLength(1);
    changeManifest(dir, (manifest) => {
      manifest.points[0].devices.pop();
    });
    expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow('missing physical GPU');
    const mismatched = multinodeFixture();
    changeArtifact(mismatched, benchmarkPath, (row) => {
      row.prefill_gpu_energy_j = 100;
    });
    expect(() => verifyRequiredPowerArtifacts(mismatched, source)).toThrow(
      'prefill energy differs',
    );
  });
  it('normalizes producer dp-attn strings and binds nested planned role topology', () => {
    const dir = fixture();
    changeArtifact(dir, benchmarkPath, (row) => {
      row.dp_attention = 'false';
    });
    changeManifest(dir, (manifest) => {
      manifest.points[0].topology.dp_attention = 'false';
      manifest.matrix.single_node.agentic[0]['dp-attn'] = false;
    });
    expect(verifyRequiredPowerArtifacts(dir, source)).toHaveLength(1);
    const split = multinodeFixture();
    changeManifest(split, (manifest) => {
      manifest.matrix.multi_node.agentic[0].prefill = { tp: 8, 'num-worker': 1 };
    });
    expect(() => verifyRequiredPowerArtifacts(split, source)).toThrow(
      'prefill_tp topology differs from required matrix',
    );
  });
  it('supports fixed-window sidecar names and AMD physical UUID artifacts', () => {
    const dir = fixture();
    fs.renameSync(
      path.join(dir, auditPath),
      path.join(dir, 'agentic_golden/power_validation_conc1.json'),
    );
    fs.unlinkSync(path.join(dir, 'agentic_golden/gpu_metrics_identity.csv'));
    const amdPath = 'agentic_golden/gpu_metrics_devices.json';
    write(dir, amdPath, { devices: [{ gpu: 0, uuid: 'amd-physical-uuid' }] });
    changeManifest(dir, (manifest) => {
      const point = manifest.points[0];
      point.devices[0].gpu_uuid = 'amd-physical-uuid';
      point.artifacts = point.artifacts.filter(
        (artifact: any) => !artifact.path.endsWith('gpu_metrics_identity.csv'),
      );
      point.artifacts.find((artifact: any) => artifact.path === auditPath).path =
        'agentic_golden/power_validation_conc1.json';
      point.artifacts.push({
        path: amdPath,
        sha256: createHash('sha256')
          .update(fs.readFileSync(path.join(dir, amdPath)))
          .digest('hex'),
        validation_state: 'valid',
      });
    });
    expect(verifyRequiredPowerArtifacts(dir, source)).toHaveLength(1);
  });
  it('rejects invalid sidecar verdict and device energy disagreement despite valid hashes', () => {
    const dir = fixture();
    changeArtifact(dir, auditPath, (audit) => {
      audit.power_valid = false;
    });
    expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow('invalid audit');
    const other = fixture();
    changeManifest(other, (manifest) => {
      manifest.points[0].devices[0].energy_j = 2;
    });
    expect(() => verifyRequiredPowerArtifacts(other, source)).toThrow('differs from audit');
  });
  it('rejects duplicate points, required matrix omissions, wrong source, and paths outside the artifact root', () => {
    const edits = [
      (manifest: any) => {
        manifest.points.push(manifest.points[0]);
      },
      (manifest: any) => {
        manifest.matrix.single_node.agentic[0].conc = [1, 2];
      },
      (manifest: any) => {
        manifest['run-id'] = 999;
      },
      (manifest: any) => {
        manifest.points[0].artifacts[0].path = '../secret';
      },
    ];
    for (const edit of edits) {
      const dir = fixture();
      changeManifest(dir, edit);
      expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow('Required power:');
    }
  });
  it('accepts identical aggregate copies but rejects conflicting duplicate rows', () => {
    const dir = fixture();
    fs.mkdirSync(path.join(dir, 'results_bmk'));
    fs.copyFileSync(path.join(dir, benchmarkPath), path.join(dir, 'results_bmk/agg.json'));
    expect(verifyRequiredPowerArtifacts(dir, source)).toHaveLength(1);
    const rows = json(dir, benchmarkPath);
    rows.avg_power_w = 501;
    write(dir, 'results_bmk/agg.json', rows);
    expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow('conflicting');
  });
  it('retains every required identity after local purges and backfills', () => {
    const required = verifyRequiredPowerArtifacts(golden, source);
    expect(() =>
      assertRequiredPowerPointsRetained(required, [{ ...required[0], conc: 2 }]),
    ).toThrow('missing benchmark point');
    expect(() => assertRequiredPowerPointsRetained(required, required)).not.toThrow();
  });
});
