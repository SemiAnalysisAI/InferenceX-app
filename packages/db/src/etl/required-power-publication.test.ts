import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readBenchmarkArtifacts } from './benchmark-artifacts';
import {
  assertRequiredPowerPointsRetained,
  verifyRequiredPowerArtifacts,
} from './required-power-publication';
import { createSkipTracker } from './skip-tracker';

const golden = path.resolve(import.meta.dirname, 'fixtures/powerx-manifest-v2');
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
function sha256(dir: string, file: string) {
  return createHash('sha256')
    .update(fs.readFileSync(path.join(dir, file)))
    .digest('hex');
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
        if (artifact.path === file) artifact.sha256 = sha256(dir, file);
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
      point.artifacts.push({ path: file, sha256: sha256(dir, file), validation_state: 'valid' });
  });
  return dir;
}
const nativeNodes = { 'node-a': 'GPU-a', 'node-b': 'GPU-b' };
/** Non-disagg two-node bundle whose telemetry is per-node nvidia-smi with signed receipts. */
function nativeFixture() {
  const dir = fixture();
  changeArtifact(dir, benchmarkPath, (row) =>
    Object.assign(row, { is_multinode: true, disagg: false, num_gpus: 2 }),
  );
  const files: string[] = [];
  const receipts = Object.entries(nativeNodes).map(([node, uuid]) => {
    const directory = `power_audit_golden/${node}`;
    fs.mkdirSync(path.join(dir, directory), { recursive: true });
    const contents: Record<string, string> = {
      'gpu_metrics.csv': `timestamp, index, power.draw [W]\n2023/11/14 22:13:20.000, 0, 500\n`,
      'manifest.json': JSON.stringify({ lifecycle: 'complete', collector_exit_code: 0, node }),
      'gpu_metrics_identity.csv': `index, uuid\n0, ${uuid}\n`,
      'gpu_metrics_identity_end.csv': `index, uuid\n0, ${uuid}\n# end\n`,
    };
    for (const [name, text] of Object.entries(contents)) {
      fs.writeFileSync(path.join(dir, directory, name), text);
      files.push(`${directory}/${name}`);
    }
    return {
      node,
      manifest_sha256: sha256(dir, `${directory}/manifest.json`),
      telemetry_sha256: sha256(dir, `${directory}/gpu_metrics.csv`),
      identity_sha256: sha256(dir, `${directory}/gpu_metrics_identity.csv`),
      identity_end_sha256: sha256(dir, `${directory}/gpu_metrics_identity_end.csv`),
      physical_gpu_ids: { '0': uuid },
    };
  });
  changeArtifact(dir, auditPath, (audit) =>
    Object.assign(audit, {
      telemetry_kind: 'native_multinode_smi',
      expected_gpu_count: 2,
      observed_gpu_count: 2,
      nodes: receipts,
      per_gpu_energy_j: { 'GPU-a': 500, 'GPU-b': 500 },
      per_gpu_role: { 'GPU-a': 'agg', 'GPU-b': 'agg' },
    }),
  );
  changeManifest(dir, (manifest) => {
    const entry = manifest.matrix.single_node.agentic[0];
    Object.assign(entry, { 'num-gpus': 2, 'node-count': 2 });
    manifest.matrix = { single_node: {}, multi_node: { agentic: [entry] } };
    const point = manifest.points[0];
    Object.assign(point.topology, { is_multinode: true, num_gpus: 2 });
    point.devices = Object.entries(nativeNodes).map(([node, gpu_uuid]) => ({
      node,
      gpu_uuid,
      role: 'aggregate',
      energy_j: 500,
    }));
    // The single-node gpu_metrics.csv must not stay declared: traces are counted per node.
    point.artifacts = [auditPath, benchmarkPath, ...files].map((file) => ({
      path: file,
      sha256: sha256(dir, file),
      validation_state: 'valid',
    }));
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
    expect(verifyRequiredPowerArtifacts(dir, source)).toBeNull();
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
    expect(verifyRequiredPowerArtifacts(dir, source)?.points).toHaveLength(1);
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
  it('rejects an audit from a telemetry collector it does not know', () => {
    const dir = multinodeFixture();
    changeArtifact(dir, auditPath, (audit) => {
      audit.telemetry_kind = 'amd_device_metrics';
    });
    expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow('unsupported telemetry_kind');
  });
  it('accepts a native multinode bundle with per-node receipts', () => {
    expect(verifyRequiredPowerArtifacts(nativeFixture(), source)?.points).toHaveLength(1);
  });
  it('rejects a native receipt whose telemetry hash differs', () => {
    const dir = nativeFixture();
    changeArtifact(dir, auditPath, (audit) => {
      audit.nodes[0].telemetry_sha256 = 'f'.repeat(64);
    });
    expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow('native node receipt differs');
  });
  it('rejects an incomplete native node collection', () => {
    const dir = nativeFixture();
    const nodeManifest = 'power_audit_golden/node-a/manifest.json';
    changeArtifact(dir, nodeManifest, (value) => {
      value.lifecycle = 'partial';
    });
    // Re-sign the receipt so only the lifecycle check can fire.
    changeArtifact(dir, auditPath, (audit) => {
      audit.nodes[0].manifest_sha256 = sha256(dir, nodeManifest);
    });
    expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow(
      'invalid native node collection',
    );
  });
  it('rejects duplicate native GPU identities across nodes', () => {
    const dir = nativeFixture();
    changeArtifact(dir, auditPath, (audit) => {
      audit.nodes[1].physical_gpu_ids = { '0': 'GPU-a' };
    });
    expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow(
      'duplicate native GPU identity',
    );
  });
  it('accepts a JSON physical GPU identity file', () => {
    const dir = fixture();
    const csv = 'agentic_golden/gpu_metrics_identity.csv';
    const devices = 'agentic_golden/gpu_metrics_devices.json';
    fs.rmSync(path.join(dir, csv));
    write(dir, devices, [{ gpu: 0, uuid: 'GPU-golden' }]);
    changeManifest(dir, (manifest) => {
      for (const artifact of manifest.points[0].artifacts)
        if (artifact.path === csv)
          Object.assign(artifact, { path: devices, sha256: sha256(dir, devices) });
    });
    expect(verifyRequiredPowerArtifacts(dir, source)?.points).toHaveLength(1);
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
  it('verifies a lent artifact read instead of reading again', () => {
    const files = readBenchmarkArtifacts(golden, {
      runId: source.runId,
      tracker: createSkipTracker(),
    });
    expect(verifyRequiredPowerArtifacts(golden, source, false, () => files)?.points).toHaveLength(
      1,
    );
    const tampered = files.map((file) => ({ ...file, sha256: '0'.repeat(64) }));
    expect(() => verifyRequiredPowerArtifacts(golden, source, false, () => tampered)).toThrow(
      'hash',
    );
  });
  it('accepts identical aggregate copies but rejects conflicting duplicate rows', () => {
    const dir = fixture();
    fs.mkdirSync(path.join(dir, 'results_bmk'));
    fs.copyFileSync(path.join(dir, benchmarkPath), path.join(dir, 'results_bmk/agg.json'));
    expect(verifyRequiredPowerArtifacts(dir, source)?.points).toHaveLength(1);
    const rows = json(dir, benchmarkPath);
    rows.avg_power_w = 501;
    write(dir, 'results_bmk/agg.json', rows);
    expect(() => verifyRequiredPowerArtifacts(dir, source)).toThrow('conflicting');
  });
  it('names the stage when a required identity is missing or a power field differs', () => {
    const required = verifyRequiredPowerArtifacts(golden, source)!.points;
    const dropped = [{ ...required[0], conc: 2 }];
    expect(() => assertRequiredPowerPointsRetained(required, dropped, 'before_write')).toThrow(
      'Required power (before_write): missing benchmark point',
    );
    expect(() => assertRequiredPowerPointsRetained(required, dropped, 'after_insert')).toThrow(
      '(after_insert)',
    );
    const altered = [{ ...required[0], metrics: { ...required[0].metrics, avg_power_w: 1 } }];
    expect(() => assertRequiredPowerPointsRetained(required, altered, 'after_insert')).toThrow(
      'avg_power_w differs from the verified artifact',
    );
    expect(() =>
      assertRequiredPowerPointsRetained(required, required, 'before_write'),
    ).not.toThrow();
  });
});
