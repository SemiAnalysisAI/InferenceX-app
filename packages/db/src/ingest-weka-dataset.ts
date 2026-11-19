import { createAdminSql } from './etl/db-utils';
import { hasNoSslFlag } from './cli-utils';
import {
  buildConversationStructure,
  countConversationRequests,
  linearHistogram,
  logHistogram,
  logHistogramWithZero,
  subagentRequestTurns,
  summarizeValues,
  type ConversationStructure,
  type RawWekaConversation,
  type TurnNode,
} from './etl/weka-structure';

const ROWS_API = 'https://datasets-server.huggingface.co/rows';
const INFO_API = 'https://datasets-server.huggingface.co/info';

interface CliArgs {
  dataset: string;
  label?: string;
  variant?: string;
  description?: string;
  limit?: number;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith('--'));
  const dataset = positional[0];
  if (!dataset) {
    console.error(
      'Usage: bun src/ingest-weka-dataset.ts <hf-dataset-id> [--label …] [--variant full|256k] [--description …] [--limit N]',
    );
    process.exit(1);
  }
  const getFlag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const limitRaw = getFlag('limit');
  return {
    dataset,
    label: getFlag('label'),
    variant: getFlag('variant'),
    description: getFlag('description'),
    limit: limitRaw ? Number(limitRaw) : undefined,
  };
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function fetchJson(url: string, attempt = 0): Promise<unknown> {
  const res = await fetch(url);
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 6) {
      throw new Error(`${res.status} ${res.statusText} after ${attempt} retries for ${url}`);
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt;
    console.warn(
      `  ${res.status} ${res.statusText}; waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1})`,
    );
    await sleep(waitMs);
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
  return res.json();
}

async function getRowCount(dataset: string): Promise<number> {
  const info = (await fetchJson(`${INFO_API}?dataset=${encodeURIComponent(dataset)}`)) as {
    dataset_info?: Record<string, { splits?: Record<string, { num_examples?: number }> }>;
  };
  const cfg = info.dataset_info?.['default'];
  const num = cfg?.splits?.['train']?.num_examples;
  return typeof num === 'number' ? num : 0;
}

async function* iterRows(
  dataset: string,
  total: number,
  limit?: number,
): AsyncGenerator<RawWekaConversation> {
  const cap = limit ? Math.min(limit, total) : total;
  let offset = 0;
  let length = 5;
  while (offset < cap) {
    const want = Math.min(length, cap - offset);
    const url = `${ROWS_API}?dataset=${encodeURIComponent(dataset)}&config=default&split=train&offset=${offset}&length=${want}`;
    let payload: { rows?: { row: RawWekaConversation }[] };
    try {
      payload = (await fetchJson(url)) as { rows?: { row: RawWekaConversation }[] };
    } catch (error) {
      if (want > 1) {
        length = Math.max(1, Math.floor(want / 2));
        console.warn(
          `  page @${offset} (len ${want}) failed (${String(error)}); retrying with len ${length}`,
        );
        continue;
      }
      throw error;
    }
    const rows = payload.rows ?? [];
    if (rows.length === 0) break;
    for (const r of rows) yield r.row;
    offset += rows.length;
    process.stdout.write(`\r  fetched ${Math.min(offset, cap)}/${cap} conversations`);
    if (offset < cap) await sleep(400);
  }
  process.stdout.write('\n');
}

interface Accumulator {
  inputPerTurn: number[];
  uncachedInputPerTurn: number[];
  outputPerTurn: number[];
  cachedFractionPerTurn: number[];
  turnsPerConv: number[];
  requestsPerConv: number[];
  subagentInputPerRequest: number[];
  subagentOutputPerRequest: number[];
  subagentGroupsPerConv: number[];
  subagentTurnsPerGroup: number[];
  totalIn: number;
  totalOut: number;
  totalCached: number;
  mainTurns: number;
  subagentGroups: number;
  subagentTurns: number;
  modelCounts: Record<string, number>;
}

function newAccumulator(): Accumulator {
  return {
    inputPerTurn: [],
    uncachedInputPerTurn: [],
    outputPerTurn: [],
    cachedFractionPerTurn: [],
    turnsPerConv: [],
    requestsPerConv: [],
    subagentInputPerRequest: [],
    subagentOutputPerRequest: [],
    subagentGroupsPerConv: [],
    subagentTurnsPerGroup: [],
    totalIn: 0,
    totalOut: 0,
    totalCached: 0,
    mainTurns: 0,
    subagentGroups: 0,
    subagentTurns: 0,
    modelCounts: {},
  };
}

function recordTurn(acc: Accumulator, t: TurnNode): void {
  acc.inputPerTurn.push(t.in);
  acc.uncachedInputPerTurn.push(t.uncached);
  acc.outputPerTurn.push(t.out);
  if (t.in > 0) acc.cachedFractionPerTurn.push(t.cached / t.in);
  if (t.model) acc.modelCounts[t.model] = (acc.modelCounts[t.model] ?? 0) + 1;
}

function accumulate(acc: Accumulator, s: ConversationStructure): void {
  acc.totalIn += s.totals.in;
  acc.totalOut += s.totals.out;
  acc.totalCached += s.totals.cached;
  acc.mainTurns += s.totals.numTurns;
  acc.subagentGroups += s.totals.numSubagentGroups;
  acc.turnsPerConv.push(s.totals.numTurns);
  acc.requestsPerConv.push(countConversationRequests(s));
  for (const turn of subagentRequestTurns(s)) {
    acc.subagentInputPerRequest.push(turn.in);
    acc.subagentOutputPerRequest.push(turn.out);
  }
  acc.subagentGroupsPerConv.push(s.totals.numSubagentGroups);
  for (const node of s.nodes) {
    if (node.kind === 'turn') {
      recordTurn(acc, node);
    } else {
      acc.subagentTurnsPerGroup.push(node.children.length);
      acc.subagentTurns += node.children.length;
      for (const child of node.children) recordTurn(acc, child);
    }
  }
}

function buildChartData(acc: Accumulator) {
  return {
    version: 3,
    inputTokensPerTurn: {
      bins: logHistogram(acc.inputPerTurn),
      stats: summarizeValues(acc.inputPerTurn),
    },
    uncachedInputTokensPerTurn: {
      bins: logHistogramWithZero(acc.uncachedInputPerTurn),
      stats: summarizeValues(acc.uncachedInputPerTurn),
    },
    outputTokensPerTurn: {
      bins: logHistogram(acc.outputPerTurn),
      stats: summarizeValues(acc.outputPerTurn),
    },
    subagentInputTokensPerRequest: {
      bins: logHistogram(acc.subagentInputPerRequest),
      stats: summarizeValues(acc.subagentInputPerRequest),
    },
    subagentOutputTokensPerRequest: {
      bins: logHistogram(acc.subagentOutputPerRequest),
      stats: summarizeValues(acc.subagentOutputPerRequest),
    },
    turnsPerConversation: {
      bins: linearHistogram(acc.turnsPerConv),
      stats: summarizeValues(acc.turnsPerConv),
    },
    subagentGroupsPerConversation: {
      bins: linearHistogram(acc.subagentGroupsPerConv),
      stats: summarizeValues(acc.subagentGroupsPerConv),
    },
    cachedFractionPerTurn: {
      bins: linearHistogram(acc.cachedFractionPerTurn, 20),
      stats: summarizeValues(acc.cachedFractionPerTurn),
    },
  };
}

function buildSummary(acc: Accumulator, blockSize: number, hashIdScope: string | null) {
  const cachedPct = acc.totalIn > 0 ? acc.totalCached / acc.totalIn : 0;
  const requestsPerConversation = summarizeValues(acc.requestsPerConv);
  const subagentsPerTrace = summarizeValues(acc.subagentGroupsPerConv);
  return {
    version: 3,
    blockSize,
    hashIdScope,
    totalIn: acc.totalIn,
    totalOut: acc.totalOut,
    totalCached: acc.totalCached,
    cachedPct,
    mainTurns: acc.mainTurns,
    subagentGroups: acc.subagentGroups,
    subagentTurns: acc.subagentTurns,
    meanRequestsPerConversation: requestsPerConversation.mean,
    medianRequestsPerConversation: requestsPerConversation.median,
    meanSubagentsPerTrace: subagentsPerTrace.mean,
    medianSubagentsPerTrace: subagentsPerTrace.median,
    modelMix: acc.modelCounts,
  };
}

function slugFromDataset(dataset: string): string {
  return dataset.includes('/') ? dataset.slice(dataset.indexOf('/') + 1) : dataset;
}

function inferVariant(slug: string): string {
  if (slug.endsWith('-256k')) return '256k';
  if (slug.includes('no-subagent')) return 'no-subagents';
  return 'full';
}

function defaultLabel(slug: string): string {
  return slug
    .split('-')
    .map((p) => (/^\d+$/u.test(p) ? p : p.toUpperCase()))
    .join(' ')
    .replace(/^CC TRACES WEKA/u, 'CC Traces Weka');
}

async function main(): Promise<void> {
  const args = parseArgs();
  const slug = slugFromDataset(args.dataset);
  const variant = args.variant ?? inferVariant(slug);
  const label = args.label ?? defaultLabel(slug);
  const hfUrl = `https://huggingface.co/datasets/${args.dataset}`;

  console.log(`=== ingest-weka-dataset: ${args.dataset} ===`);
  console.log(`  slug=${slug} variant=${variant} label="${label}"`);

  const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 1 });

  const total = await getRowCount(args.dataset);
  console.log(`  ${total} conversations on HF`);

  const acc = newAccumulator();
  let blockSize = 64;
  let hashIdScope: string | null = null;

  interface ConvRow {
    dataset_id: string;
    conv_id: string;
    models: string[];
    num_turns: number;
    num_subagent_groups: number;
    total_in: number;
    total_out: number;
    total_cached: number;
    structure: ConversationStructure;
  }
  const pending: ConvRow[] = [];

  try {
    await sql`
      insert into datasets (id, slug, label, variant, description, hf_url, license)
      values (${args.dataset}, ${slug}, ${label}, ${variant}, ${args.description ?? null}, ${hfUrl}, 'apache-2.0')
      on conflict (id) do update set
        slug = excluded.slug, label = excluded.label, variant = excluded.variant,
        description = coalesce(excluded.description, datasets.description),
        hf_url = excluded.hf_url, license = excluded.license, ingested_at = now()
    `;
    await sql`delete from dataset_conversations where dataset_id = ${args.dataset}`;

    const flush = async () => {
      if (pending.length === 0) return;
      const rows = pending.map((p) => ({
        dataset_id: args.dataset,
        conv_id: p.conv_id,
        models: p.models,
        num_turns: p.num_turns,
        num_subagent_groups: p.num_subagent_groups,
        total_in: p.total_in,
        total_out: p.total_out,
        total_cached: p.total_cached,
        structure: sql.json(p.structure as unknown as Parameters<typeof sql.json>[0]),
      }));
      await sql`insert into dataset_conversations ${sql(rows)}`;
      pending.length = 0;
    };

    let count = 0;
    for await (const conv of iterRows(args.dataset, total, args.limit)) {
      blockSize = conv.block_size ?? blockSize;
      hashIdScope = conv.hash_id_scope ?? hashIdScope;
      const structure = buildConversationStructure(conv);
      accumulate(acc, structure);
      pending.push({
        dataset_id: args.dataset,
        conv_id: conv.id,
        models: Array.isArray(conv.models) ? conv.models : [],
        num_turns: structure.totals.numTurns,
        num_subagent_groups: structure.totals.numSubagentGroups,
        total_in: structure.totals.in,
        total_out: structure.totals.out,
        total_cached: structure.totals.cached,
        structure,
      });
      count += 1;
      if (pending.length >= 25) await flush();
    }
    await flush();

    const summary = buildSummary(acc, blockSize, hashIdScope);
    const chartData = buildChartData(acc);
    await sql`
      update datasets set
        conversation_count = ${count},
        summary = ${sql.json(summary as unknown as Parameters<typeof sql.json>[0])},
        chart_data = ${sql.json(chartData as unknown as Parameters<typeof sql.json>[0])},
        ingested_at = now()
      where id = ${args.dataset}
    `;

    console.log(`\n  ingested ${count} conversations`);
    console.log(
      `  main turns=${acc.mainTurns} subagent groups=${acc.subagentGroups} subagent turns=${acc.subagentTurns}`,
    );
    console.log(
      `  totals: in=${acc.totalIn.toLocaleString()} out=${acc.totalOut.toLocaleString()} ` +
        `cached=${acc.totalCached.toLocaleString()} (${(summary.cachedPct * 100).toFixed(1)}% of input)`,
    );
    console.log('\n=== done ===');
    console.log('  Purge the API cache: POST /api/v1/invalidate');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
