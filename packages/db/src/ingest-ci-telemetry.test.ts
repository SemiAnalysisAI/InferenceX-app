import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type * as DbUtils from './etl/db-utils';
import type * as ConfigCache from './etl/config-cache';
import type * as BenchmarkIngest from './etl/benchmark-ingest';
import type * as ChangelogIngest from './etl/changelog-ingest';
import type * as TelemetryReceipt from './etl/telemetry-receipt';
import type * as RunOverrides from './etl/run-overrides';

const mocks = vi.hoisted(() => ({
  finish: undefined as (() => void) | undefined,
  persistBenchmark: vi.fn(() => Promise.resolve({ newCount: 1, dupCount: 0, insertedIds: [10] })),
  configFailure: false,
  purgeExtra: false,
  serverLogFailure: false,
}));
vi.mock('./etl/db-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof DbUtils>()),
  createAdminSql: () =>
    Object.assign(() => Promise.resolve([{ n: 1 }]), {
      end: () => Promise.resolve(mocks.finish?.()),
    }),
  refreshLatestBenchmarks: async () => {},
}));
vi.mock('./etl/config-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof ConfigCache>()),
  createConfigCache: () => ({
    getOrCreateConfig: (config: { hardware: string }) =>
      mocks.configFailure && config.hardware === 'b200'
        ? Promise.reject(new Error('Fixture config failure'))
        : Promise.resolve(1),
    preloadConfigs: async () => {},
    size: 1,
  }),
}));
vi.mock('./etl/workflow-run', () => ({
  createWorkflowRunServices: () => ({
    fetchGithubRun: () => Promise.resolve({ createdAt: '2026-09-21T00:00:00Z' }),
    getOrCreateWorkflowRun: () => Promise.resolve(1),
  }),
}));
vi.mock('./etl/benchmark-ingest', async (importOriginal) => ({
  ...(await importOriginal<typeof BenchmarkIngest>()),
  bulkIngestBenchmarkRows: mocks.persistBenchmark,
  bulkUpsertAvailability: async () => {},
  insertServerLogFiles: () => Promise.reject(new Error('Fixture server log failure')),
}));
vi.mock('./etl/changelog-ingest', async (importOriginal) => ({
  ...(await importOriginal<typeof ChangelogIngest>()),
  ingestChangelogEntries: () => Promise.resolve(1),
}));
vi.mock('./etl/telemetry-receipt', async (importOriginal) => ({
  ...(await importOriginal<typeof TelemetryReceipt>()),
  readTelemetryReceipt: (
    _sql: unknown,
    run: unknown,
    observations: unknown,
    options: { expectedSource: string },
  ) =>
    Promise.resolve({
      run,
      points: observations,
      expectedSource: options.expectedSource,
    }),
}));
vi.mock('./etl/run-overrides', async (importOriginal) => {
  const actual = await importOriginal<typeof RunOverrides>();
  return {
    ...actual,
    isBenchmarkPointPurged: (...args: Parameters<typeof RunOverrides.isBenchmarkPointPurged>) =>
      (mocks.purgeExtra && args[2].conc === 2) || actual.isBenchmarkPointPurged(...args),
  };
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.configFailure = false;
  mocks.purgeExtra = false;
  mocks.serverLogFailure = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

interface Scenario {
  name: string;
  extra?: Record<string, unknown> | string;
  unknown?: boolean;
  configFailure?: boolean;
  purgeExtra?: boolean;
  serverLogFailure?: boolean;
  ingestError?: string;
}
const scenarios: Scenario[] = [
  { name: 'unreadable telemetry alone' },
  {
    name: 'unreadable benchmark JSON',
    extra: '{',
    unknown: true,
    ingestError: 'Unreadable benchmark JSON: bmk_agentic_extra/agg.json',
  },
  { name: 'non-object benchmark JSON', extra: '42', unknown: true },
  { name: 'unmapped model', extra: { infmax_model_prefix: 'unknown-model' }, unknown: true },
  { name: 'unmapped hardware', extra: { hw: 'unknown-hardware' }, unknown: true },
  { name: 'missing concurrency', extra: { users: null, conc: null }, unknown: true },
  {
    name: 'missing sequence length',
    extra: { scenario_type: 'single_turn', isl: null, osl: 1024 },
    unknown: true,
  },
  {
    name: 'config resolution failure',
    extra: { hw: 'b200' },
    configFailure: true,
    unknown: true,
    ingestError: '1 database ingest errors',
  },
  { name: 'explicit failed benchmark', extra: { benchmark_outcome: { status: 'failed' } } },
  {
    name: 'zero successful requests',
    extra: { num_requests_total: 2, num_requests_successful: 0 },
  },
  { name: 'purged benchmark', extra: {}, purgeExtra: true },
  {
    name: 'unrelated server log failure',
    serverLogFailure: true,
    ingestError: '1 database ingest errors',
  },
];

it.each(scenarios)(
  'keeps the benchmark and honest expectation scope with $name',
  async (scenario) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-telemetry-'));
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    try {
      mocks.configFailure = scenario.configFailure ?? false;
      mocks.purgeExtra = scenario.purgeExtra ?? false;
      mocks.serverLogFailure = scenario.serverLogFailure ?? false;
      process.argv = ['bun', 'ingest-ci-run.ts'];
      process.exitCode = undefined;
      for (const [key, value] of Object.entries({
        DATABASE_WRITE_URL: 'postgres://unused:unused@127.0.0.1:1/unused',
        GITHUB_TOKEN: 'unused',
        INGEST_RUN_ID: '123',
        INGEST_RUN_ATTEMPT: '2',
        INGEST_ARTIFACTS_PATH: dir,
        INGEST_REPO: 'SemiAnalysisAI/InferenceX',
        POWER_PUBLICATION_MANIFEST: path.join(dir, 'power-publication.json'),
        INGEST_REQUIRE_POWER: 'false',
      }))
        vi.stubEnv(key, value);
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      fs.cpSync(
        new URL(
          '../../../docs/fixtures/powerx-manifest-v2/artifacts/bmk_agentic_golden/',
          import.meta.url,
        ),
        path.join(dir, 'bmk_agentic_golden'),
        { recursive: true },
      );
      fs.mkdirSync(path.join(dir, 'gpu_metrics_golden'));
      fs.writeFileSync(
        path.join(dir, 'gpu_metrics_golden', 'gpu_metrics.csv'),
        'not,a,telemetry,csv\n',
      );
      if (scenario.extra !== undefined) {
        fs.mkdirSync(path.join(dir, 'bmk_agentic_extra'));
        const row = JSON.parse(
          fs.readFileSync(path.join(dir, 'bmk_agentic_golden', 'agg.json'), 'utf8'),
        );
        fs.writeFileSync(
          path.join(dir, 'bmk_agentic_extra', 'agg.json'),
          typeof scenario.extra === 'string'
            ? scenario.extra
            : JSON.stringify({ ...row, conc: 2, users: 2, ...scenario.extra }),
        );
      }
      if (mocks.serverLogFailure) {
        fs.mkdirSync(path.join(dir, 'server_logs_golden'));
        fs.writeFileSync(path.join(dir, 'server_logs_golden', 'server.log'), 'server ready\n');
      }
      const complete = new Promise<void>((resolve) => {
        mocks.finish = resolve;
      });
      await import('./ingest-ci-run');
      await complete;
      const manifest = JSON.parse(
        fs.readFileSync(path.join(dir, 'power-publication.json'), 'utf8'),
      );
      expect(mocks.persistBenchmark, JSON.stringify(manifest)).toHaveBeenCalledOnce();
      expect(process.exitCode).toBeUndefined();
      expect(manifest.ingestErrors).toEqual(scenario.ingestError ? [scenario.ingestError] : []);
      expect(manifest.telemetry.expectedSource).toBe(
        scenario.unknown ? 'unknown' : 'benchmark_artifacts',
      );
      expect(manifest.telemetryWarnings).toEqual(['1 gpu_metrics digest errors']);
      expect(manifest.telemetry.points).toEqual([
        expect.objectContaining({
          produced: true,
          artifactNames: ['gpu_metrics_golden'],
          error: 'No parseable telemetry series in gpu_metrics_golden',
        }),
      ]);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);
