import type { ApiSchema } from '@/lib/api-documentation';

const text: ApiSchema = { type: 'string' };
const scalar: ApiSchema = { type: 'number' };
const count: ApiSchema = { type: 'integer', minimum: 0 };
const bool: ApiSchema = { type: 'boolean' };
const nullableNumber: ApiSchema = { type: ['number', 'null'] };
const nullableText: ApiSchema = { type: ['string', 'null'] };
const array = (items: ApiSchema): ApiSchema => ({ type: 'array', items });
const record = (properties: Record<string, ApiSchema>): ApiSchema => ({
  type: 'object',
  properties,
  additionalProperties: true,
});
const unknown: ApiSchema = { type: 'object', additionalProperties: true };
const series = array(record({ t: scalar, value: scalar }));
const distribution = record({
  bins: array(record({ x0: scalar, x1: scalar, count })),
  stats: record({
    count,
    min: scalar,
    max: scalar,
    mean: scalar,
    median: scalar,
    p75: scalar,
    p90: scalar,
    p95: scalar,
  }),
});
const row = record({
  key: text,
  label: text,
  sublabel: text,
  timeLabel: text,
  cached: scalar,
  uncached: scalar,
  output: scalar,
  total: scalar,
  indent: count,
  isGroup: bool,
  isExpanded: bool,
  groupIndex: count,
  overlaps: array(
    record({ id: text, label: text, color: text, startS: scalar, endS: scalar, peerCount: count }),
  ),
});
const seg = record({
  role: { type: 'string', enum: ['first', 'middle', 'last', 'through'] },
  isMember: bool,
  color: text,
  groupId: text,
  peerCount: count,
  startS: scalar,
  endS: scalar,
});

export const datasetFields = {
  dataset: record({
    slug: text,
    summary: unknown,
    chart_data: record({
      version: count,
      inputTokensPerTurn: distribution,
      outputTokensPerTurn: distribution,
      uncachedInputTokensPerTurn: distribution,
      subagentInputTokensPerRequest: distribution,
      subagentOutputTokensPerRequest: distribution,
      turnsPerConversation: distribution,
      subagentGroupsPerConversation: distribution,
      cachedFractionPerTurn: distribution,
    }),
  }),
  conversations: record({ total: count, items: array(record({ conv_id: text })) }),
  pagination: record({ returned: count, total: count, hasMore: bool }),
  flamegraph: {
    ...record({
      conversation: record({ conv_id: text, structure: record({ nodes: array(unknown) }) }),
      rows: array(row),
      expanded: array(count),
      target: {
        ...record({ rowKey: text, expandGroup: nullableNumber }),
        type: ['object', 'null'],
      },
      maxTokens: scalar,
      maxGroupTokens: scalar,
      brackets: record({
        laneCount: count,
        overflowLanes: count,
        rowSegs: array(array(record({ lane: count, seg }))),
      }),
    }),
    type: ['object', 'null'],
  },
} satisfies Record<string, ApiSchema>;

export const catalogFields = {
  groups: array(
    record({
      key: text,
      label: text,
      totalPoints: count,
      cards: array(
        record({
          id: count,
          label: text,
          hardwareKey: text,
          hardwareLabel: text,
          frameworkLabel: text,
          precisionLabel: text,
          vendor: text,
          arch: text,
          points: count,
          minConc: count,
          maxConc: count,
          latestDate: text,
        }),
      ),
    }),
  ),
  configCount: count,
  pointCount: count,
};

export const pointFields = {
  charts: record({
    assumptions: unknown,
    latency: record({ raw: series, trend: series, cumulative: series }),
    interactivity: record({ raw: series, trend: series, cumulative: series }),
    sequence: record({ isl: unknown, osl: unknown }),
    completedRequests: series,
    inflightUniqueTokens: record({ raw: series, smoothed: series, cumulative: series }),
    server: {
      ...record({
        throughput: array(unknown),
        kvCacheUsage: series,
        hostKvCacheUsage: series,
        prefixCacheHitRate: series,
        queueDepth: unknown,
      }),
      type: ['object', 'null'],
    },
  }),
  requestData: record({
    version: count,
    timelineVersion: count,
    startNs: scalar,
    endNs: scalar,
    durationS: scalar,
    requests: array(
      record({
        cid: text,
        phase: text,
        start: scalar,
        end: scalar,
        ttftMs: nullableNumber,
        tpotMs: nullableNumber,
        isl: nullableNumber,
        osl: nullableNumber,
        cancelled: bool,
      }),
    ),
  }),
  serverData: {
    ...record({
      durationS: scalar,
      series: record({
        kvCacheUsage: series,
        prefixCacheHitRate: series,
        queueDepth: array(record({ t: scalar, running: scalar, waiting: scalar, total: scalar })),
        promptTokensBySource: { type: 'object', additionalProperties: series },
        prefillTps: series,
        decodeTps: series,
        prefixCacheHitsTps: series,
        hostKvCacheUsage: series,
        kvCacheUsageByEngine: array(record({ engineLabel: text, points: series })),
      }),
    }),
    type: ['object', 'null'],
  },
  boundarySec: nullableNumber,
  origins: record({ requestStartNs: scalar, serverStartNs: nullableNumber }),
  meta: { ...unknown, type: ['object', 'null'] },
  metricSources: array(record({ source: record({ id: text }) })),
  kvCachePoolTokens: nullableNumber,
} satisfies Record<string, ApiSchema>;

export const sampleFields = {
  samples: array(
    record({
      docId: count,
      prompt: nullableText,
      target: nullableText,
      response: nullableText,
      rawResponse: nullableText,
      demonstrations: { type: ['array', 'null'], items: record({ question: text, answer: text }) },
      score: nullableNumber,
      passed: { type: ['boolean', 'null'] },
      metrics: { type: 'object', additionalProperties: scalar },
    }),
  ),
  total: count,
  passedTotal: count,
  failedTotal: count,
  pageCount: count,
  searchScope: { type: 'string', enum: ['current-page'] },
  source: { type: 'string', enum: ['db', 'github_artifact'] },
} satisfies Record<string, ApiSchema>;

/** Minimal illustrative values, not sampled production evidence. */
export function schemaExample(schema: ApiSchema): unknown {
  if (Array.isArray(schema.type)) return null;
  if (schema.enum) return schema.enum[0];
  if (schema.type === 'array') return [];
  if (schema.type === 'boolean') return false;
  if (schema.type === 'integer' || schema.type === 'number') return schema.minimum ?? 0;
  if (schema.type === 'string') return '';
  return Object.fromEntries(
    Object.entries(schema.properties ?? {}).map(([key, value]) => [key, schemaExample(value)]),
  );
}
