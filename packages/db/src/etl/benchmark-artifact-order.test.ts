import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  benchmarkArtifactOrder,
  BenchmarkArtifactSelection,
  writeArtifactManifest,
} from './benchmark-artifact-order';
import { benchmarkPointIngestKey } from './benchmark-ingest';
import { mapBenchmarkRow } from './benchmark-mapper';
import { createSkipTracker } from './skip-tracker';

const roots: string[] = [];
afterEach(() =>
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })),
);
const setup = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-ingest-'));
  roots.push(root);
  return root;
};
const oldName = 'bmk_agentic_dsv41flash_tp8_conc4_spec-mt-596d42bfe2ec61f96a94';
const retryName = 'bmk_agentic_dsv41flash_tp8_conc4_spec-mt-b6cd309bca4cf0053334';
const artifacts = [
  { name: oldName, id: 10784989208, created_at: '2026-09-24T01:35:25Z', archive_download_url: '' },
  {
    name: retryName,
    id: 10799608471,
    created_at: '2026-09-24T09:17:42Z',
    archive_download_url: '',
  },
];
const raw = (attempt: number) =>
  JSON.parse(
    fs.readFileSync(
      new URL(`./__fixtures__/h100-retry/attempt${attempt}.json`, import.meta.url),
      'utf8',
    ),
  );

describe('benchmark retry selection', () => {
  it.each([false, true])(
    'publishes the real H100 C4 retry and only its sidecars regardless of enumeration order (%s)',
    (reverse) => {
      const root = setup();
      writeArtifactManifest(root, reverse ? artifacts.toReversed() : artifacts);
      const oldFile = path.join(root, oldName, 'point.json');
      const retryFile = path.join(root, retryName, 'point.json');
      const order = benchmarkArtifactOrder(
        root,
        reverse ? [retryFile, oldFile] : [oldFile, retryFile],
      );
      const selection = new BenchmarkArtifactSelection(order.selectNewest);
      const persisted = new Map();
      const sidecars: string[] = [];
      for (const file of order.files) {
        const input = raw(file === retryFile ? 2 : 1);
        const mapped = mapBenchmarkRow(input, createSkipTracker(), undefined, '35925522496')!;
        expect(mapped).not.toBeNull();
        const identity = benchmarkPointIngestKey({ ...mapped, configId: 1 });
        if (!selection.accept(identity, file)) continue;
        persisted.set(identity, input);
        sidecars.push(path.basename(path.dirname(file)));
      }
      expect(persisted.size).toBe(1);
      const selected = [...persisted.values()][0];
      expect(selected.num_requests_successful).toBe(105);
      expect(selected).toEqual(raw(2));
      expect(selected).not.toEqual(raw(1));
      expect(sidecars).toEqual([retryName]);
    },
  );

  it('keeps different recipes, topologies and concurrencies; aggregate fills only absent points', () => {
    const root = setup();
    const aggregate = {
      name: 'results_bmk',
      id: 999,
      created_at: '2026-09-25T00:00:00Z',
      archive_download_url: '',
    };
    writeArtifactManifest(root, [...artifacts, aggregate]);
    const job = path.join(root, retryName, 'point.json');
    const collected = path.join(root, 'results_bmk', 'agg.json');
    expect(benchmarkArtifactOrder(root, [collected, job, collected]).files).toEqual([
      job,
      collected,
    ]);
    const selection = new BenchmarkArtifactSelection(true);
    const point = {
      configId: 1,
      benchmarkType: 'agentic_traces' as const,
      isl: null,
      osl: null,
      conc: 4,
      offloadMode: 'none',
      recipeFingerprint: 'recipe-a',
    };
    expect(selection.accept(benchmarkPointIngestKey(point), job)).toBe(true);
    expect(selection.accept(benchmarkPointIngestKey(point), collected)).toBe(false);
    for (const different of [
      { ...point, configId: 2 },
      { ...point, conc: 8 },
      { ...point, recipeFingerprint: 'recipe-b' },
    ]) {
      expect(selection.accept(benchmarkPointIngestKey(different), collected)).toBe(true);
    }
  });

  it('breaks equal upload times by artifact ID and rejects incomplete provenance', () => {
    const root = setup();
    writeArtifactManifest(
      root,
      artifacts.map((a) => ({ ...a, created_at: artifacts[0]!.created_at })),
    );
    const files = artifacts.map((a) => path.join(root, a.name, 'point.json'));
    expect(benchmarkArtifactOrder(root, files).files).toEqual(files.toReversed());
    expect(() => benchmarkArtifactOrder(root, [path.join(root, 'unknown', 'point.json')])).toThrow(
      'Missing upload provenance',
    );
  });

  it('retains legacy bundle behavior without invented upload timestamps', () => {
    const root = setup();
    const files = [
      path.join(root, oldName, 'point.json'),
      path.join(root, retryName, 'point.json'),
    ];
    expect(benchmarkArtifactOrder(root, files)).toEqual({ files, selectNewest: false });
    const selection = new BenchmarkArtifactSelection(false);
    expect(selection.accept('same', files[0]!)).toBe(true);
    expect(selection.accept('same', files[1]!)).toBe(true);
  });
});
