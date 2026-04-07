/**
 * Fetch and aggregate benchmark data for SEO article generation.
 * Outputs a JSON file that Claude uses to write natural-language articles.
 *
 * Usage:
 *   pnpm admin:seo:data                                              # production API
 *   pnpm admin:seo:data --base-url http://localhost:3000             # local dev
 *   pnpm admin:seo:data --output /tmp/seo-data.json                  # custom output path
 */

import fs from 'node:fs';
import path from 'node:path';

import { GPU_VENDORS } from '@semianalysisai/inferencex-constants';

import {
  aggregateHistory,
  aggregateModelData,
  allModels,
  computeParetoFrontiers,
  configDisplayName,
  costPerMtok,
  detectImprovements,
  distinctGpus,
  fetchBenchmarks,
  fetchChangelogs,
  fetchHistory,
} from './seo/data';
import type { BestConfig, HistoryPoint, Improvement, MatchupData, ParetoPoint } from './seo/types';
import { getGpuSpecs } from '../src/lib/constants';
import gpuPairPopularity from './seo/gpu-pair-popularity.json';

/** Look up user view count for a GPU pair from PostHog analytics data. */
function getGpuPairPopularity(gpuA: string, gpuB: string): number {
  const pairs = gpuPairPopularity.pairs as Record<string, number>;
  // Extract base GPU from display name (e.g. "NVIDIA B200" → "b200")
  const a = gpuA.split(' ').pop()!.toLowerCase();
  const b = gpuB.split(' ').pop()!.toLowerCase();
  const [first, second] = [a, b].toSorted();
  return pairs[`${first}|${second}`] ?? 0;
}

const PRIMARY_SEQ = '8k/1k';
const MIN_GPUS = 2;

/** Model category — mirrors MODEL_CONFIG in src/lib/data-mappings.ts */
const MODEL_CATEGORY: Record<string, 'default' | 'experimental' | 'deprecated'> = {
  dsr1: 'default',
  gptoss120b: 'default',
  llama70b: 'deprecated',
  'qwen3.5': 'experimental',
  'kimik2.5': 'experimental',
  'minimaxm2.5': 'experimental',
  glm5: 'experimental',
};

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): { baseUrl: string; output: string } {
  const args = process.argv.slice(2);
  let baseUrl = 'https://inferencex.semianalysis.com';
  let output = path.join(process.cwd(), 'tmp', 'seo-data.json');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base-url' && args[i + 1]) {
      baseUrl = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      output = args[++i];
    }
  }

  return { baseUrl: baseUrl.replace(/\/$/, ''), output };
}

// ---------------------------------------------------------------------------
// Serializable output types
// ---------------------------------------------------------------------------

interface SerializableBestConfig extends BestConfig {
  gpuDisplayName: string;
  /** Dashboard-style label e.g. "B200 (Dynamo TRT) FP4" */
  configLabel: string;
  vendor: string;
  costMtokHyperscaler: number;
  costMtokNeocloud: number;
  costMtokRental: number;
}

interface SerializableModelData {
  modelKey: string;
  displayName: string;
  slug: string;
  category: 'default' | 'experimental' | 'deprecated';
  totalRows: number;
  sequences: Record<string, SerializableBestConfig[]>;
  primarySequence: string;
  gpuCount: number;
  precisionCount: number;
  frameworkCount: number;
  history: Record<string, HistoryPoint[]>;
  /** Throughput vs interactivity pareto curves per GPU at primary sequence. */
  paretoFrontiers: Record<string, ParetoPoint[]>;
}

interface SeoDataOutput {
  generatedAt: string;
  baseUrl: string;
  primarySequence: string;
  models: SerializableModelData[];
  matchups: MatchupData[];
  improvements: Improvement[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function gpuDisplay(hw: string): string {
  const vendor = GPU_VENDORS[hw];
  const upper = hw.toUpperCase();
  return vendor ? `${vendor} ${upper}` : upper;
}

function enrichConfig(c: BestConfig): SerializableBestConfig {
  const specs = getGpuSpecs(c.hardware);
  return {
    ...c,
    gpuDisplayName: gpuDisplay(c.hardware),
    configLabel: configDisplayName(c.hardware, c.framework, c.precision),
    vendor: GPU_VENDORS[c.hardware] ?? 'Unknown',
    costMtokHyperscaler: costPerMtok(specs.costh, c.tputPerGpu),
    costMtokNeocloud: costPerMtok(specs.costn, c.tputPerGpu),
    costMtokRental: costPerMtok(specs.costr, c.tputPerGpu),
  };
}

interface FetchResult {
  modelKey: string;
  displayName: string;
  status: 'included' | 'skipped_no_data' | 'skipped_few_gpus' | 'error';
  reason?: string;
}

async function processModel(
  baseUrl: string,
  modelKey: string,
  displayName: string,
): Promise<{ result: FetchResult; entry?: SerializableModelData }> {
  const rows = await fetchBenchmarks(baseUrl, displayName);
  if (rows.length === 0) {
    return {
      result: { modelKey, displayName, status: 'skipped_no_data', reason: 'no benchmark data' },
    };
  }

  const data = aggregateModelData(modelKey, displayName, rows);
  const gpus = distinctGpus(data, PRIMARY_SEQ);

  if (gpus.size < MIN_GPUS) {
    return {
      result: {
        modelKey,
        displayName,
        status: 'skipped_few_gpus',
        reason: `only ${gpus.size} GPU(s) at ${PRIMARY_SEQ} (need ${MIN_GPUS}+)`,
      },
    };
  }

  const primaryConfigs = data.bestBySequence.get(PRIMARY_SEQ) ?? [];

  // Convert Map to plain object for JSON serialization
  const sequences: Record<string, SerializableBestConfig[]> = {};
  for (const [seq, configs] of data.bestBySequence) {
    sequences[seq] = configs.map(enrichConfig);
  }

  // Fetch historical data for all models (8k/1k)
  const category = MODEL_CATEGORY[modelKey] ?? 'default';
  const historyRows = await fetchHistory(baseUrl, displayName, 8192, 1024);
  const history = aggregateHistory(historyRows);
  if (historyRows.length > 0) {
    console.log(
      `  ${displayName}: ${historyRows.length} history rows → ${Object.keys(history).length} configs`,
    );
  }

  // Pareto frontiers: always use latest benchmarks (rows), not history.
  // The latest_benchmarks view has ALL concurrency levels at the most recent date,
  // which gives the full throughput-vs-interactivity sweep needed for pareto curves.
  const paretoFrontiers = computeParetoFrontiers(rows, { isl: 8192, osl: 1024 });

  const entry: SerializableModelData = {
    modelKey,
    displayName,
    slug: `best-gpu-for-${modelKey.replaceAll('.', '')}-inference`,
    category,
    totalRows: rows.length,
    sequences,
    primarySequence: PRIMARY_SEQ,
    gpuCount: new Set(primaryConfigs.map((c) => c.hardware)).size,
    precisionCount: new Set(primaryConfigs.map((c) => c.precision)).size,
    frameworkCount: new Set(primaryConfigs.map((c) => c.framework)).size,
    history,
    paretoFrontiers,
  };

  return { result: { modelKey, displayName, status: 'included' }, entry };
}

/** Build GPU-pair matchup data for head-to-head articles. */
function computeMatchups(models: SerializableModelData[]): MatchupData[] {
  // For each model, find the best config per GPU at the primary sequence
  const gpuBestByModel = new Map<string, Map<string, SerializableBestConfig>>();

  for (const model of models) {
    const configs = model.sequences[model.primarySequence] ?? [];
    const bestPerGpu = new Map<string, SerializableBestConfig>();
    for (const c of configs) {
      const existing = bestPerGpu.get(c.hardware);
      if (!existing || c.tputPerGpu > existing.tputPerGpu) {
        bestPerGpu.set(c.hardware, c);
      }
    }
    gpuBestByModel.set(model.modelKey, bestPerGpu);
  }

  // Find all GPU pairs that share 2+ models
  const allGpus = new Set<string>();
  for (const bestPerGpu of gpuBestByModel.values()) {
    for (const hw of bestPerGpu.keys()) allGpus.add(hw);
  }
  const gpuList = [...allGpus].toSorted();

  const matchups: MatchupData[] = [];

  for (let i = 0; i < gpuList.length; i++) {
    for (let j = i + 1; j < gpuList.length; j++) {
      const gpuA = gpuList[i];
      const gpuB = gpuList[j];
      const sharedModels: MatchupData['sharedModels'] = [];

      for (const model of models) {
        const bestPerGpu = gpuBestByModel.get(model.modelKey)!;
        const configA = bestPerGpu.get(gpuA);
        const configB = bestPerGpu.get(gpuB);
        if (configA && configB) {
          sharedModels.push({
            model: model.displayName,
            modelKey: model.modelKey,
            tputA: configA.tputPerGpu,
            tputB: configB.tputPerGpu,
            costMtokA: configA.costMtokHyperscaler,
            costMtokB: configB.costMtokHyperscaler,
            intvtyA: configA.medianIntvty,
            intvtyB: configB.medianIntvty,
          });
        }
      }

      if (sharedModels.length < 2) continue;

      let winsA = 0;
      let winsB = 0;
      let totalPctDiff = 0;
      for (const m of sharedModels) {
        if (m.tputA > m.tputB) winsA++;
        else winsB++;
        const max = Math.max(m.tputA, m.tputB);
        const min = Math.min(m.tputA, m.tputB);
        totalPctDiff += min > 0 ? (max - min) / min : 0;
      }

      matchups.push({
        gpuA: gpuDisplay(gpuA),
        gpuB: gpuDisplay(gpuB),
        sharedModels,
        winsA,
        winsB,
        avgPctDiff: totalPctDiff / sharedModels.length,
      });
    }
  }

  // Sort by user interest (PostHog view counts), then shared model count
  return matchups.toSorted((a, b) => {
    const popA = getGpuPairPopularity(a.gpuA, a.gpuB);
    const popB = getGpuPairPopularity(b.gpuA, b.gpuB);
    if (popA !== popB) return popB - popA;
    return b.sharedModels.length - a.sharedModels.length || a.avgPctDiff - b.avgPctDiff;
  });
}

async function main() {
  const { baseUrl, output } = parseArgs();
  const models = allModels();
  console.log(`Fetching benchmark data from: ${baseUrl} (${models.length} models in parallel)\n`);

  const settled = await Promise.allSettled(
    models.map(([modelKey, displayName]) => processModel(baseUrl, modelKey, displayName)),
  );

  const result: SeoDataOutput = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    primarySequence: PRIMARY_SEQ,
    models: [],
    matchups: [],
    improvements: [],
  };

  const fetchResults: FetchResult[] = [];

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    const [modelKey, displayName] = models[i];

    if (outcome.status === 'rejected') {
      const reason =
        outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      fetchResults.push({ modelKey, displayName, status: 'error', reason });
      continue;
    }

    fetchResults.push(outcome.value.result);
    if (outcome.value.entry) {
      result.models.push(outcome.value.entry);
    }
  }

  // Detect improvements from history data
  for (const model of result.models) {
    if (Object.keys(model.history).length > 0) {
      const modelImprovements = detectImprovements(model.history, model.displayName);
      result.improvements.push(...modelImprovements);
    }
  }
  result.improvements.sort((a, b) => b.pctGain - a.pctGain);

  // Enrich top improvements with changelogs and related config history
  const topImprovements = result.improvements.slice(0, 5);
  for (const imp of topImprovements) {
    // Fetch changelogs for the improvement date
    const changelogs = await fetchChangelogs(baseUrl, imp.newDate);
    // Filter to changelogs that mention this hardware or framework
    imp.changelogs = changelogs.filter(
      (c) =>
        c.configKeys.some((k) => k.includes(imp.hardware) || k.includes(imp.framework)) ||
        c.configKeys.length === 0,
    );

    // Add related history: other configs on the same hardware for the same model
    const model = result.models.find((m) => m.displayName === imp.model);
    if (model) {
      const related: Record<string, HistoryPoint[]> = {};
      for (const [key, points] of Object.entries(model.history)) {
        const isImprovedConfig =
          key === `${imp.hardware}|${imp.framework}|${imp.precision}|${imp.disagg}`;
        // Include: the improved config itself + other configs on the same hardware
        if (isImprovedConfig || key.startsWith(`${imp.hardware}|`)) {
          related[key] = points;
        }
      }
      imp.relatedHistory = related;
    }

    if (imp.changelogs.length > 0) {
      console.log(
        `  Improvement ${imp.hardware} ${imp.framework}: ${imp.changelogs.length} changelog(s)`,
      );
    }
  }

  // Generate GPU matchups (pairs that share 2+ models)
  result.matchups = computeMatchups(result.models);

  // Write output
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2), 'utf8');

  // Print summary
  const included = fetchResults.filter((r) => r.status === 'included');
  const skipped = fetchResults.filter(
    (r) => r.status === 'skipped_no_data' || r.status === 'skipped_few_gpus',
  );
  const errors = fetchResults.filter((r) => r.status === 'error');

  console.log('\n--- Summary ---');
  console.log(`Total models: ${fetchResults.length}`);
  console.log(`Included:     ${included.length}`);
  console.log(`Skipped:      ${skipped.length}`);
  console.log(`Errors:       ${errors.length}`);

  if (skipped.length > 0) {
    console.log('\nSkipped models:');
    for (const r of skipped) {
      console.log(`  ${r.displayName}: ${r.reason}`);
    }
  }

  if (errors.length > 0) {
    console.log('\nFailed models:');
    for (const r of errors) {
      console.log(`  ${r.displayName}: ${r.reason}`);
    }
  }

  console.log(`\nWrote ${result.models.length} models to: ${output}`);
}

main().catch((error) => {
  console.error('generate-seo-data failed:', error);
  process.exitCode = 1;
});
