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
  it('fails missing required manifests even when changelog metadata is also missing', () => {
    const dir = fixture();
    fs.rmSync(path.join(dir, 'required-power-sweep-manifest'), { recursive: true });
    expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow('sweep manifest missing');
    fs.rmSync(path.join(dir, 'changelog-metadata'), { recursive: true });
    expect(() => verifyRequiredPowerArtifacts(dir, source, true)).toThrow('sweep manifest missing');
    expect(verifyRequiredPowerArtifacts(dir, source)).toEqual([]);
  });
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
  it('rejects a measured zero energy', () => {
    const dir = fixture();
    changeArtifact(dir, benchmarkPath, (rows) => {
      rows.total_gpu_energy_j = 0;
    });
    expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow(
      'total_gpu_energy_j must be finite and positive',
    );
  });
  it('does not replace canonical AgentX users with a conflicting raw conc', () => {
    const dir = fixture();
    changeArtifact(dir, benchmarkPath, (rows) => {
      rows.conc = 1;
      rows.users = 2;
    });
    expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow('missing benchmark point');
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
