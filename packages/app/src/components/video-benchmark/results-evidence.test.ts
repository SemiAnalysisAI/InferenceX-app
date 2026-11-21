import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { at, loadBundle, type Json } from './bundle';
import { powerTrace, resultsEvidence } from './results-evidence';
import { servingCells } from './serving';

const fixture = join(import.meta.dirname, 'fixtures/native-serving-bundle');
const read = () => loadBundle(async (path) => new Blob([await readFile(join(fixture, path))]));
function assign(value: Json, key: string, replacement: Json) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected object');
  value[key] = replacement;
}

describe('sealed results detail projection', () => {
  it('retains client P50 and the valid measurement-window power trace without inventing percentile samples', async () => {
    const bundle = await read();
    const cell = servingCells(bundle)[0];
    const detail = resultsEvidence(bundle, cell);
    expect(detail.clientP50).toBe(118);
    expect(detail.latencies).toBeNull();
    const trace = powerTrace(bundle, cell);
    expect(trace[0]).toEqual({ seconds: 0, watts: 1201 });
    expect(trace.at(-1)?.seconds).toBe(60);
    // History keeps the count; shipping the samples made the page seed several megabytes.
    expect(detail.powerSamples).toBe(61);
    expect(detail).not.toHaveProperty('powerSeries');
    expect(detail.peakPowerW).toBe(1201);
    expect(detail.mode).toBeNull();
    expect(detail.gpuMemoryMiB).toBeNull();
    assign(bundle.documents.get('gpu/c1/aggregate.json')!, 'power_valid', 0);
    const invalid = resultsEvidence(bundle, cell);
    expect(invalid.powerValid).toBe(false);
    expect(invalid.powerSamples).toBe(0);
    expect(powerTrace(bundle, cell)).toEqual([]);
    expect(invalid.peakPowerW).toBeNull();
    expect(invalid.workloadHash).toBe(at(cell.run, 'plan_sha256'));
  });
});
