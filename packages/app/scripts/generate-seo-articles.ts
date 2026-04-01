export {};

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

import { aggregateModelData, allModels, distinctGpus, fetchBenchmarks } from './seo/data';
import type { BestConfig } from './seo/types';

const PRIMARY_SEQ = '8k/1k';
const MIN_GPUS = 2;

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
  vendor: string;
}

interface SerializableModelData {
  modelKey: string;
  displayName: string;
  slug: string;
  totalRows: number;
  sequences: Record<string, SerializableBestConfig[]>;
  primarySequence: string;
  gpuCount: number;
  precisionCount: number;
  frameworkCount: number;
}

interface SeoDataOutput {
  generatedAt: string;
  baseUrl: string;
  primarySequence: string;
  models: SerializableModelData[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function gpuDisplay(hw: string): string {
  const vendor = GPU_VENDORS[hw];
  const upper = hw.toUpperCase().replace('MI', 'MI ');
  return vendor ? `${vendor} ${upper}` : upper;
}

function enrichConfig(c: BestConfig): SerializableBestConfig {
  return {
    ...c,
    gpuDisplayName: gpuDisplay(c.hardware),
    vendor: GPU_VENDORS[c.hardware] ?? 'Unknown',
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

  const entry: SerializableModelData = {
    modelKey,
    displayName,
    slug: `best-gpu-for-${modelKey}-inference`,
    totalRows: rows.length,
    sequences,
    primarySequence: PRIMARY_SEQ,
    gpuCount: new Set(primaryConfigs.map((c) => c.hardware)).size,
    precisionCount: new Set(primaryConfigs.map((c) => c.precision)).size,
    frameworkCount: new Set(primaryConfigs.map((c) => c.framework)).size,
  };

  return { result: { modelKey, displayName, status: 'included' }, entry };
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

  // Write output
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2), 'utf-8');

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

main().catch((err) => {
  console.error('generate-seo-data failed:', err);
  process.exitCode = 1;
});
