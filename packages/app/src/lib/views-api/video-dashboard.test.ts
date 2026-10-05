import { describe, expect, it } from 'vitest';
import { wanServingFixture } from '@/components/video-benchmark/serving.fixture';
import { videoHistoryEntry, type VideoHistoryPage } from '@/components/video-benchmark/history';
import fixture from '../../../cypress/fixtures/api/video-history.json';
import { videoDashboardProjection } from './video-dashboard';
import { videoCsv } from '@/components/video-benchmark/csv';
import { readVideoDashboardState } from '@/components/video-benchmark/video-url-state';

describe('VideoGenX public metadata projection', () => {
  it('retains zero-attempt failures and unjudged success counts before chart filters', () => {
    // Controlled outcome evidence; these are not new benchmark measurements.
    const page = structuredClone(fixture) as unknown as VideoHistoryPage;
    const source = page.entries
      .flatMap((entry) => entry.sources)
      .find((item) => item.hardware === 'H200')!;
    const counts = {
      cell: 'c1',
      concurrency: 1,
      status: 'complete',
      workloadKey: null,
      mode: 'closed-loop',
      scheduled: 20,
      attempted: 20,
      completed: 20,
      failed: 0,
      timedOut: 0,
      notStarted: 0,
      valid: 20,
      unjudged: 20,
      legacyFailedSlots: 0,
      unfinished: 0,
      deliveryDeadlineSeconds: null,
      qualitySloGoodput: null,
      provenance: 'request-ledger' as const,
    };
    source.serving = [counts];
    page.entries[0].sources.push({
      ...source,
      id: 'amd-not-started',
      hardware: 'MI355X',
      observations: [],
      serving: [
        {
          ...counts,
          status: 'failed',
          attempted: 0,
          completed: 0,
          valid: 0,
          unjudged: 0,
          notStarted: 20,
          legacyFailedSlots: 20,
        },
      ],
    });
    const result = videoDashboardProjection([page], 'v_y=quality&v_qmin=4&v_hidden=h200,mi355x');
    expect(result.plot.plotted).toEqual([]);
    expect(result.serving.find((row) => row.sourceId === 'amd-not-started')).toMatchObject({
      scheduled: 20,
      attempted: 0,
      failed: 0,
      notStarted: 20,
      qualitySloGoodput: null,
    });
    expect(
      result.serving.find((row) => row.sourceId === source.id && row.cell === 'c1'),
    ).toMatchObject({
      valid: 20,
      unjudged: 20,
      qualitySloGoodput: null,
    });
  });

  it('shares quality eligibility, nulls and selection with the exported CSV', () => {
    const page = structuredClone(fixture) as unknown as VideoHistoryPage;
    for (const search of [
      'v_y=quality',
      'v_y=videosPerGpuHour&v_qmin=4',
      'v_y=quality&v_optimal=0',
    ]) {
      const result = videoDashboardProjection([page], search);
      expect(result.quality.eligible).toBe(0);
      expect(result.plot.plotted).toEqual([]);
      expect(result.rows).toEqual([]);
      expect(result.quality.exclusions.every((r) => r.reasons.includes('unjudged'))).toBe(true);
      const csv = videoCsv(result.cells, readVideoDashboardState(search));
      expect(csv.trim().split('\n')).toHaveLength(1);
      expect(csv).toContain('reader_quality_threshold');
    }
    const search = 'v_y=videosPerGpuHour&v_hidden=h100&v_optimal=0';
    const result = videoDashboardProjection([page], search);
    const csv = videoCsv(result.cells, readVideoDashboardState(search));
    expect(csv.trim().split('\n')).toHaveLength(result.rows.length + 1);
    for (const row of result.rows) {
      expect(csv).toContain(row.point.id);
      expect(csv).toContain(String(row.metrics.videosPerGpuHour));
      expect(row.point.provenance?.manifestSha256).toBeTruthy();
    }
    expect(csv).not.toContain('NVIDIA H100');
    expect(result.plot.plotted.map((p) => p.id)).toEqual(result.rows.map((r) => r.point.id));
  });
  it('keeps an empty catalog unavailable rather than synthesizing zero metrics or comparison evidence', () => {
    const result = videoDashboardProjection([], 'v_hidden=h100,unknown&v_api=0');
    expect(result.workload).toBeNull();
    expect(result.rows).toEqual([]);
    expect(result.plot.plotted).toEqual([]);
    expect(result.params.hidden).toEqual(['h100']);
    expect(result.params.apiPrice).toBeGreaterThan(0);
    expect(result.kpis).toHaveLength(4);
    expect(result.kpis.every((row) => row.point === null && row.metrics === null)).toBe(true);
    expect(result.comparison).toEqual({ baseline: null, candidate: null, metrics: [] });
    expect(result.evidence.powerRange).toBeNull();
    expect(result.evidence.plateauSummary).toBeNull();
    expect(result.provenance).toEqual([]);
  });
  it('keeps a different deployment in chart selection but out of the shared evidence cohort', () => {
    const page = structuredClone(fixture) as unknown as VideoHistoryPage;
    for (const entry of page.entries)
      for (const source of entry.sources)
        for (const observation of source.observations) {
          if (!observation.hardware.includes('B200')) continue;
          observation.participating = 8;
          observation.server = { tp: 4, ulysses: 2, attention: null };
        }
    const result = videoDashboardProjection([page], '');
    expect(result.rows.some((row) => row.point.hardwareKey === 'b200')).toBe(true);
    expect(result.evidence.plateau).toHaveLength(6);
    expect(result.evidence.plateau.some((row) => row.hardwareKey === 'b200')).toBe(false);
    expect(result.evidence.plateauSummary?.queued).toBe(4);
    expect(result.evidence.facts.participating).toBe(4);
    expect(result.evidence.power).toHaveLength(2);
    expect(result.evidence.scaling).toHaveLength(1);
  });
});

it('separates Wan results, pricing and provenance from H3 without inventing missing data', () => {
  const page = structuredClone(fixture) as unknown as VideoHistoryPage;
  const empty = videoDashboardProjection([page], 'v_model=wan22');
  expect(empty.params).toMatchObject({ model: 'wan22', apiPrice: null });
  for (const key of ['cells', 'rows', 'kpis', 'serving', 'provenance'] as const)
    expect(empty[key]).toEqual([]);
  const original = videoDashboardProjection([page], '');
  // Synthetic model identity ONLY for isolation regression testing, never a published measurement.
  const source = structuredClone(page.entries[0].sources.find((s) => s.observations.length)!);
  source.id = 'synthetic-wan';
  source.observations[0].quality = {
    scale: 'ordinal_0_to_4',
    contractId: 'h3-only',
    contractSha256: null,
    rubricVersion: null,
    rubricSha256: null,
    metrics: {},
  };
  source.model = 'Wan-AI/Wan2.2-T2V-A14B';
  source.observations = source.observations.map((o) => ({
    ...o,
    model: source.model!,
    id: `wan-${o.id}`,
    workload: `Wan test ${o.workload}`,
    workloadKey: `wan-${o.workloadKey}`,
  }));
  page.entries[0].sources.push(source);
  const wan = videoDashboardProjection([page], 'v_model=wan22');
  expect(wan.cells.length).toBeGreaterThan(0);
  expect(wan.cells.every((point) => point.model === source.model)).toBe(true);
  expect(wan.cells.every((point) => point.quality === null)).toBe(true);
  expect(wan.quality.eligible).toBe(0);
  expect(wan.rows.every((row) => row.metrics.apiPricePerVideo === null)).toBe(true);
  expect(wan.provenance.flatMap((entry) => entry.sources.map((s) => s.id))).toEqual([
    'synthetic-wan',
  ]);
  expect(videoDashboardProjection([page], '').cells).toEqual(original.cells);
  source.observations = [];
  expect(videoDashboardProjection([page], 'v_model=wan22').serving.length).toBeGreaterThan(0);
  expect(videoDashboardProjection([page], '').serving).toEqual(original.serving);
});

it('excludes ambiguous source identities instead of mixing models', () => {
  const page = structuredClone(fixture) as unknown as VideoHistoryPage;
  const source = page.entries[0].sources.find((s) => s.observations.length)!;
  source.model = 'Wan-AI/Wan2.2-T2V-A14B';
  for (const query of ['', 'v_model=wan22']) {
    const ids = videoDashboardProjection([page], query).provenance.flatMap((e) =>
      e.sources.map((s) => s.id),
    );
    expect(ids).not.toContain(source.id);
  }
  delete source.model;
  source.observations.push({ ...source.observations[0], model: 'Wan-AI/Wan2.2-T2V-A14B' });
  for (const query of ['', 'v_model=wan22']) {
    const ids = videoDashboardProjection([page], query).provenance.flatMap((e) =>
      e.sources.map((s) => s.id),
    );
    expect(ids).not.toContain(source.id);
  }
});

it('reads generic Wan producer success and preflight failures through the shared history projection', () => {
  const producer = wanServingFixture();
  producer.documents.set('manifest.json', producer.manifest);
  producer.documents.set('ci.json', producer.ci);
  producer.checksums.set('manifest.json', 'a'.repeat(64));
  const project = () =>
    videoHistoryEntry(
      {
        storageVersion: 1,
        runId: '123',
        artifact: { id: 40, name: 'video-serving-123-1', expired: false, size_in_bytes: 100 },
        sources: [
          {
            id: '123',
            documents: [...producer.documents],
            checksums: [...producer.checksums],
            assets: [],
            texts: [],
          },
        ],
      },
      null,
    );
  const pages = () => [{ schemaVersion: 1 as const, entries: [project()], nextPage: null }];
  const success = videoDashboardProjection(pages(), 'v_model=wan22');
  expect(success.cells).toHaveLength(3);
  expect(success.serving[0]).toMatchObject({
    scheduled: 20,
    valid: 20,
    unjudged: 20,
    qualitySloGoodput: null,
  });
  expect(success.cells[0].model).toBe('Wan-AI/Wan2.2-T2V-A14B-Diffusers');
  expect(videoDashboardProjection(pages(), '').serving).toEqual([]);
  const matrix = producer.documents.get('serving-smoke.json');
  Object.assign(matrix!, {
    gpu_uuids: [],
    cells: [
      {
        concurrency: 1,
        status: 'failed',
        verified: false,
        completion: {
          scheduled: 20,
          attempted: 0,
          completed: 0,
          valid: 0,
          failed: 20,
          not_started: 20,
        },
      },
    ],
  });
  const failure = videoDashboardProjection(pages(), 'v_model=wan22');
  expect(failure.cells).toEqual([]);
  expect(failure.serving[0]).toMatchObject({
    scheduled: 20,
    attempted: 0,
    notStarted: 20,
    failed: 0,
    qualitySloGoodput: null,
  });
  expect(failure.provenance[0].sources[0].model).toBe('Wan-AI/Wan2.2-T2V-A14B-Diffusers');
});
