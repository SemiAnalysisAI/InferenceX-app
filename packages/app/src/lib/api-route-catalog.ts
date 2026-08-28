export type ApiRouteClassification =
  | 'published-read'
  | 'page-bff'
  | 'ui-artifact-read'
  | 'public-mutation'
  | 'admin'
  | 'sensitive'
  | 'documentation';

export type ApiRouteHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface BilingualReviewText {
  readonly en: string;
  readonly zh: string;
}

interface ApiRouteCatalogEntryBase {
  /** Path relative to packages/app. */
  readonly source: `src/app/api/${string}/route.ts`;
  /** App Router path normalized to an OpenAPI path template. */
  readonly path: `/api/${string}`;
  readonly method: ApiRouteHttpMethod;
  readonly sourceSha256: string;
}

export interface PublishedApiRouteCatalogEntry extends ApiRouteCatalogEntryBase {
  readonly classification: 'published-read';
  readonly operationId: string;
  readonly exclusionReason?: never;
}

export interface ExcludedApiRouteCatalogEntry extends ApiRouteCatalogEntryBase {
  readonly classification: Exclude<ApiRouteClassification, 'published-read'>;
  readonly operationId?: never;
  readonly exclusionReason: BilingualReviewText;
}

export type ApiRouteCatalogEntry = PublishedApiRouteCatalogEntry | ExcludedApiRouteCatalogEntry;

/**
 * Review ledger for every App Router HTTP handler under src/app/api.
 *
 * A route digest changing is intentionally noisy: review the handler's public
 * contract and either update the API documentation or affirm the classification
 * before replacing the digest.
 */
export const apiRouteCatalog = [
  {
    source: 'src/app/api/gpu-metrics/route.ts',
    path: '/api/gpu-metrics',
    method: 'GET',
    classification: 'ui-artifact-read',
    exclusionReason: {
      en: 'UI-only live GPU metric artifact lookup; its run artifact shape is not a stable public contract.',
      zh: '仅供界面读取实时 GPU 指标制品；其运行制品结构不是稳定的公开契约。',
    },
    // 2026-08: additive optional `power` block assembled from same-suffix
    // bmk_*/power_audit_* sibling artifacts; still a UI-only unstable shape.
    sourceSha256: 'e2e860cca7365a49fa56e39657a2e7d272a061544415f3adcf445a5a24f94e3c',
  },
  {
    source: 'src/app/api/openapi.json/route.ts',
    path: '/api/openapi.json',
    method: 'GET',
    classification: 'documentation',
    exclusionReason: {
      en: 'Documentation transport endpoint; it publishes the OpenAPI projection rather than application data.',
      zh: '文档传输端点；它发布 OpenAPI 投影，而不是应用数据。',
    },
    sourceSha256: '5ea5c034c837fda109ca3b7218db51a6ac78bca3eac545371de0f2a45880d533',
  },
  {
    source: 'src/app/api/unofficial-run/route.ts',
    path: '/api/unofficial-run',
    method: 'GET',
    classification: 'ui-artifact-read',
    exclusionReason: {
      en: 'UI-only overlay for unofficial workflow artifacts; upstream artifact availability and shape are not stable.',
      zh: '仅供界面叠加非官方工作流制品；上游制品的可用性和结构并不稳定。',
    },
    sourceSha256: '4a3f3da8399c741c26f0f502d44b1870a8ccdc05775edfd6ea3dee4e020df25c',
  },
  {
    source: 'src/app/api/v1/agentic-aggregates/route.ts',
    path: '/api/v1/agentic-aggregates',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-agentic-aggregates',
    sourceSha256: '7dab9929039926b2697d5db71c143eb39f94e795a0d83bb0348db8869f279a5f',
  },
  {
    source: 'src/app/api/v1/availability/route.ts',
    path: '/api/v1/availability',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-availability',
    sourceSha256: 'f1c5845a59cefbe03f57f471a5bb63b194a8c0aa5dccc188febdc177003310f1',
  },
  {
    source: 'src/app/api/v1/benchmark-siblings/route.ts',
    path: '/api/v1/benchmark-siblings',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-benchmark-siblings',
    sourceSha256: '2b20de8b2b67ed53027eba478068f8f22ae7e3843ac38423e8ce6b27c1f74fd6',
  },
  {
    source: 'src/app/api/v1/benchmarks/route.ts',
    path: '/api/v1/benchmarks',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-benchmarks',
    sourceSha256: 'c6a5b78108b7e0d523b11590e1e34ef2e8c2d5457673eb41338d93d3d8f04909',
  },
  {
    source: 'src/app/api/v1/benchmarks/history/route.ts',
    path: '/api/v1/benchmarks/history',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-benchmark-history',
    sourceSha256: '42ba4d72298084ffe079ffcee7b6309ef3fb94d1df4769be4485d95097aa8cbe',
  },
  {
    source: 'src/app/api/v1/collectivex/latest/route.ts',
    path: '/api/v1/collectivex/latest',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-collectivex-latest',
    sourceSha256: '4d50dc7bdce61936c135c7a480fa048b97658737121ad9ff1b964d3db4cfa7ef',
  },
  {
    source: 'src/app/api/v1/collectivex/runs/route.ts',
    path: '/api/v1/collectivex/runs',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-collectivex-runs',
    sourceSha256: '60548a817e1d408e3ed3ee993b48bcecfd5b1ddffe6dc554228eb131c43b1228',
  },
  {
    source: 'src/app/api/v1/collectivex/runs/[runId]/route.ts',
    path: '/api/v1/collectivex/runs/{runId}',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-collectivex-run',
    sourceSha256: '911688cb21861d86639c1c75e9081c263433a6ab4d41959fb9a0e723e507733e',
  },
  {
    source: 'src/app/api/v1/collectivex/runs/[runId]/route.ts',
    path: '/api/v1/collectivex/runs/{runId}',
    method: 'DELETE',
    classification: 'admin',
    exclusionReason: {
      en: 'Authenticated CollectiveX administration mutation; deletion is not part of the public read API.',
      zh: '需要身份验证的 CollectiveX 管理写操作；删除不属于公开只读 API。',
    },
    sourceSha256: '911688cb21861d86639c1c75e9081c263433a6ab4d41959fb9a0e723e507733e',
  },
  {
    source: 'src/app/api/v1/datasets/route.ts',
    path: '/api/v1/datasets',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-datasets',
    sourceSha256: '2a779884ef1a44c9a14f7f4a2005495a9809aa91448c1401674fd9d99b32c65e',
  },
  {
    source: 'src/app/api/v1/datasets/[slug]/route.ts',
    path: '/api/v1/datasets/{slug}',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-dataset',
    sourceSha256: 'cf2e1e5e31604222f7558b9dc32f2273db082d086a8b0e3687b723b34a6380ae',
  },
  {
    source: 'src/app/api/v1/datasets/[slug]/conversations/route.ts',
    path: '/api/v1/datasets/{slug}/conversations',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-dataset-conversations',
    sourceSha256: 'f02b0e3c77c6043491ac53a179fb2ca090575f6bb6066119fd78c7919bfc5dbf',
  },
  {
    source: 'src/app/api/v1/datasets/[slug]/conversations/[convId]/route.ts',
    path: '/api/v1/datasets/{slug}/conversations/{convId}',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-dataset-conversation',
    sourceSha256: 'cc29285f5744a12d52ab66b6648caec8fc183fbe4915a1ebd59357643db3dc63',
  },
  {
    source: 'src/app/api/v1/derived-agentic-metrics/route.ts',
    path: '/api/v1/derived-agentic-metrics',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-derived-agentic-metrics',
    sourceSha256: '68013b8e1a0354e677c075b5ab31df4be5889fdc0dc2eb82dbe52a108f4d1db2',
  },
  {
    source: 'src/app/api/v1/eval-samples-live/route.ts',
    path: '/api/v1/eval-samples-live',
    method: 'GET',
    classification: 'ui-artifact-read',
    exclusionReason: {
      en: 'UI-only evaluation sample reader backed by live workflow artifacts with an unstable artifact contract.',
      zh: '仅供界面读取由实时工作流制品支持的评测样本；该制品契约不稳定。',
    },
    sourceSha256: 'd5b8c36466c5882fa253e653997c7c4dd181489d754aca6fef1f98aaa103cf65',
  },
  {
    source: 'src/app/api/v1/eval-samples/route.ts',
    path: '/api/v1/eval-samples',
    method: 'GET',
    classification: 'ui-artifact-read',
    exclusionReason: {
      en: 'UI drill-down for evaluation samples; its pagination and sample payload remain page-owned.',
      zh: '用于界面下钻评测样本；其分页和样本载荷仍由页面内部使用。',
    },
    sourceSha256: '865f41e25148e30e5de094af98773eebdfc67a395cac7e1a4b75e9b96b23bf85',
  },
  {
    source: 'src/app/api/v1/evaluations/route.ts',
    path: '/api/v1/evaluations',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-evaluations',
    sourceSha256: '6fac9705f7d595b00525639d861dad2cb67dcc51fea5ef2e69da7c2d61630f35',
  },
  {
    source: 'src/app/api/v1/feedback/route.ts',
    path: '/api/v1/feedback',
    method: 'POST',
    classification: 'public-mutation',
    exclusionReason: {
      en: 'Unauthenticated feedback submission changes stored state and is intentionally outside the published read API.',
      zh: '无需身份验证的反馈提交会更改存储状态，因此有意不纳入公开只读 API。',
    },
    sourceSha256: '8ce117bca507ec2a26cbd0c6d264c76043d5d26e87108261026ec3a3344e78d0',
  },
  {
    source: 'src/app/api/v1/feedback/list/route.ts',
    path: '/api/v1/feedback/list',
    method: 'GET',
    classification: 'sensitive',
    exclusionReason: {
      en: 'Returns encrypted user feedback and request metadata for the feedback UI; ciphertext access remains sensitive.',
      zh: '为反馈界面返回加密的用户反馈和请求元数据；密文访问仍属敏感操作。',
    },
    sourceSha256: '8f5fb4a6be071000be4db58ecd89163da094e4999588ee5ecd29a9d220873211',
  },
  {
    source: 'src/app/api/v1/framework-releases/route.ts',
    path: '/api/v1/framework-releases',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-framework-releases',
    sourceSha256: 'ce0bd92ab1b567ee476f0a96b9a3b7ea3c5730b75b32d6941e8de661822be3f6',
  },
  {
    source: 'src/app/api/v1/invalidate/route.ts',
    path: '/api/v1/invalidate',
    method: 'POST',
    classification: 'admin',
    exclusionReason: {
      en: 'Secret-protected cache invalidation mutation for operators; it is not a public application contract.',
      zh: '供运维人员使用的密钥保护缓存失效写操作；它不是公开应用契约。',
    },
    sourceSha256: 'eadfc008403b3a5321f9b857897ed5c9fce2de29dee34279fb559cf1b763c247',
  },
  {
    source: 'src/app/api/v1/latest-images/route.ts',
    path: '/api/v1/latest-images',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-latest-images',
    sourceSha256: 'ae0d5535af9f5bf8d287c04f915067c0e470ec907efb2a848cb6c35660770d2d',
  },
  {
    source: 'src/app/api/v1/log-availability/route.ts',
    path: '/api/v1/log-availability',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-log-availability',
    sourceSha256: '1dab7aee9d6adf3304807823dba7463f8ccc4575afb4506e93f390b042ff2ac9',
  },
  {
    source: 'src/app/api/v1/overview/route.ts',
    path: '/api/v1/overview',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Page-owned BFF aggregation whose tier, comparison, row-scope, and calculator projections are coupled to the overview UI.',
      zh: '由页面拥有的 BFF 聚合；其档位、比较、行范围和计算器投影与概览界面紧密耦合。',
    },
    sourceSha256: '499089d01754aa470d0ced953d9818d7d2e620dd3521685099924750249f13e2',
  },
  {
    source: 'src/app/api/v1/reliability/route.ts',
    path: '/api/v1/reliability',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-reliability',
    sourceSha256: 'ce1c5db78b47548beb77a69797f10fb33853cde01cea5c44675c8ad3519bcf20',
  },
  {
    source: 'src/app/api/v1/request-chart-data/route.ts',
    path: '/api/v1/request-chart-data',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic point-detail BFF with a compact dictionary-encoded request projection coupled to the chart implementation.',
      zh: '智能体数据点详情页专用 BFF；其字典编码的精简请求投影与图表实现紧密耦合。',
    },
    sourceSha256: '44f5a6830358417eb1402c948051fe13dd05bee392c0de7b1511654d94bb7c43',
  },
  {
    source: 'src/app/api/v1/request-timeline/route.ts',
    path: '/api/v1/request-timeline',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-request-timeline',
    sourceSha256: '30659cb757b9fd23411757051b650cfb564016aa15c8b9fec48676b9591f01e9',
  },
  {
    source: 'src/app/api/v1/resident-sequence-lengths/route.ts',
    path: '/api/v1/resident-sequence-lengths',
    method: 'GET',
    classification: 'ui-artifact-read',
    exclusionReason: {
      en: 'UI-only mergeable sequence-length sketches for the resident inference-chart point set.',
      zh: '仅供界面合并当前推理图表数据点的序列长度 sketch。',
    },
    sourceSha256: '7a66a7116be3bf63a8c7fc1a54cc7eaf97405858e633daa0802cc2ae7cdbb37e',
  },
  {
    source: 'src/app/api/v1/server-log-files/route.ts',
    path: '/api/v1/server-log-files',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-server-log-files',
    sourceSha256: '367628818cb02273505c4826d35407e10c45ed4eced69b628da091cde79db0cf',
  },
  {
    source: 'src/app/api/v1/server-log-search/route.ts',
    path: '/api/v1/server-log-search',
    method: 'GET',
    classification: 'published-read',
    operationId: 'search-server-logs',
    sourceSha256: '029a578cc8417a3ff34b6585fcc91c568e9973a2c00aab025a11cdbe9a847cb3',
  },
  {
    source: 'src/app/api/v1/server-log/route.ts',
    path: '/api/v1/server-log',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-server-log',
    sourceSha256: '13e61c279840bcc176bb75be1959cc417b711bcb329aaf278681416c078a9b69',
  },
  {
    source: 'src/app/api/v1/submissions/route.ts',
    path: '/api/v1/submissions',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-submissions',
    sourceSha256: '4c5fddd7e8d87060e724ff18a905d01165c01e764fa70d3f3f518dfe987b1e1b',
  },
  {
    source: 'src/app/api/v1/tco-feed/route.ts',
    path: '/api/v1/tco-feed',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-tco-feed',
    sourceSha256: 'e80ccbfe7b5393083078f09a4a3295bb6f85d28092fdcfdc57f9b1106bb3538b',
  },
  {
    source: 'src/app/api/v1/trace-availability/route.ts',
    path: '/api/v1/trace-availability',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-trace-availability',
    sourceSha256: '0a41b121ad7ba75bc01e852d9e0d7e2fe7a4d8c47239e9ea57778be4ee21929c',
  },
  {
    source: 'src/app/api/v1/trace-histograms/route.ts',
    path: '/api/v1/trace-histograms',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-trace-histograms',
    sourceSha256: '1157a59930b754787872b0d543167c917477be27e63a6fab0cc487ffab5d4825',
  },
  {
    source: 'src/app/api/v1/trace-server-metric-source/route.ts',
    path: '/api/v1/trace-server-metric-source',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic point-detail BFF that lazily returns the full time-series arrays for one UI-selected metric source.',
      zh: '智能体数据点详情页专用 BFF；按界面选择按需返回单个指标来源的完整时间序列。',
    },
    sourceSha256: '6bf3444510f1451dff1c76414a257faec0c657d8a01ae821035a9e80addccd2c',
  },
  {
    source: 'src/app/api/v1/trace-server-metrics/route.ts',
    path: '/api/v1/trace-server-metrics',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-trace-server-metrics',
    sourceSha256: '365b428f2c32e5461cfe13966292eccecfb285e9bf348617383dda821619251f',
  },
  {
    source: 'src/app/api/v1/workflow-info/route.ts',
    path: '/api/v1/workflow-info',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-workflow-info',
    sourceSha256: '8849e70ef8a890370cb13a57ef7792e5f8522a93a4fdff7fa811a9a58f5cac32',
  },
] as const satisfies readonly ApiRouteCatalogEntry[];

export type PublicApiCachePolicy = 'public-db-day' | 'framework-release-hour';

export interface StablePublicApiContract {
  readonly operationId: string;
  readonly parameters: readonly string[];
  readonly statuses: readonly `${number}`[];
  readonly auth: 'none';
  readonly cachePolicy: PublicApiCachePolicy;
  readonly errorExamples: readonly string[];
  readonly responseShapeName: string;
}

/**
 * Reviewable behavioral contract for stable public reads. This intentionally
 * records behavior rather than defining DTOs: raw query-row types remain
 * canonical in the database package.
 */
export const stablePublicApiContracts = [
  {
    operationId: 'get-availability',
    parameters: [],
    statuses: ['200', '500'],
    auth: 'none',
    cachePolicy: 'public-db-day',
    errorExamples: ['Internal server error'],
    responseShapeName: 'AvailabilityRows',
  },
  {
    operationId: 'list-benchmarks',
    parameters: ['model', 'date', 'exact', 'runId', 'exactRun'],
    statuses: ['200', '400', '500'],
    auth: 'none',
    cachePolicy: 'public-db-day',
    errorExamples: ['Unknown model', 'Internal server error'],
    responseShapeName: 'BenchmarkRows',
  },
  {
    operationId: 'list-benchmark-history',
    parameters: ['model', 'isl', 'osl', 'benchmarkType', 'view'],
    statuses: ['200', '400', '500'],
    auth: 'none',
    cachePolicy: 'public-db-day',
    errorExamples: ['model, isl, and osl are required', 'Internal server error'],
    responseShapeName: 'BenchmarkRows',
  },
  {
    operationId: 'get-workflow-info',
    parameters: ['date', 'benchmarkType'],
    statuses: ['200', '400', '500'],
    auth: 'none',
    cachePolicy: 'public-db-day',
    errorExamples: ['Invalid date format (YYYY-MM-DD required)', 'Internal server error'],
    responseShapeName: 'WorkflowInfo',
  },
  {
    operationId: 'list-evaluations',
    parameters: [],
    statuses: ['200', '500'],
    auth: 'none',
    cachePolicy: 'public-db-day',
    errorExamples: ['Internal server error'],
    responseShapeName: 'EvaluationRows',
  },
  {
    operationId: 'list-reliability',
    parameters: [],
    statuses: ['200', '500'],
    auth: 'none',
    cachePolicy: 'public-db-day',
    errorExamples: ['Internal server error'],
    responseShapeName: 'ReliabilityRows',
  },
  {
    operationId: 'get-tco-feed',
    parameters: [
      'model',
      'workloads',
      'tiers',
      'date',
      'format',
      'view',
      'weights',
      'workload_weights',
      'alpha',
    ],
    statuses: ['200', '400', '500'],
    auth: 'none',
    cachePolicy: 'public-db-day',
    errorExamples: [
      'Invalid tiers: expected comma-separated positive numbers',
      'Internal server error',
    ],
    responseShapeName: 'TcoFeed',
  },
  {
    operationId: 'get-submissions',
    parameters: [],
    statuses: ['200', '500'],
    auth: 'none',
    cachePolicy: 'public-db-day',
    errorExamples: ['Internal server error'],
    responseShapeName: 'Submissions',
  },
  {
    operationId: 'get-framework-releases',
    parameters: [],
    statuses: ['200', '500'],
    auth: 'none',
    cachePolicy: 'framework-release-hour',
    errorExamples: ['Internal server error'],
    responseShapeName: 'FrameworkReleases',
  },
  {
    operationId: 'get-latest-images',
    parameters: [],
    statuses: ['200', '500'],
    auth: 'none',
    cachePolicy: 'public-db-day',
    errorExamples: ['Internal server error'],
    responseShapeName: 'LatestImageRows',
  },
  {
    operationId: 'list-datasets',
    parameters: [],
    statuses: ['200', '500'],
    auth: 'none',
    cachePolicy: 'public-db-day',
    errorExamples: ['Internal server error'],
    responseShapeName: 'DatasetRecords',
  },
  {
    operationId: 'get-dataset',
    parameters: ['slug'],
    statuses: ['200', '404', '500'],
    auth: 'none',
    cachePolicy: 'public-db-day',
    errorExamples: ['Not found', 'Internal server error'],
    responseShapeName: 'DatasetDetail',
  },
  {
    operationId: 'list-dataset-conversations',
    parameters: ['slug', 'search', 'limit', 'offset', 'sort'],
    statuses: ['200', '400', '404', '500'],
    auth: 'none',
    cachePolicy: 'public-db-day',
    errorExamples: ['search too long', 'Not found', 'Internal server error'],
    responseShapeName: 'ConversationList',
  },
  {
    operationId: 'get-dataset-conversation',
    parameters: ['slug', 'convId'],
    statuses: ['200', '404', '500'],
    auth: 'none',
    cachePolicy: 'public-db-day',
    errorExamples: ['Not found', 'Internal server error'],
    responseShapeName: 'ConversationDetail',
  },
] as const satisfies readonly StablePublicApiContract[];

export interface ApiContractSourceDigest {
  /** Path relative to packages/app. */
  readonly source: string;
  readonly sourceSha256: string;
  /** The API documentation area that must be reviewed when this source changes. */
  readonly reviewArea: BilingualReviewText;
}

/**
 * Shared sources that can change published parameters or response shapes without
 * touching a route module. Digest changes require an explicit documentation review.
 */
export const apiContractSourceDigests = [
  {
    source: 'src/lib/api-cache.ts',
    sourceSha256: 'b710c4ce4c2dd0a6eb3b662c9e426e301aee3afe3d64fba35745b9323be39ddd',
    reviewArea: {
      en: 'Public CDN tags, cache lifetimes, Blob key dimensions, and purge behavior.',
      zh: '公开 CDN 标签、缓存时长、Blob 键维度和清除行为。',
    },
  },
  {
    source: 'src/lib/blob-cache.ts',
    sourceSha256: 'f15476f437c5ffea9d601d5ae1fa3dfafa77b1f53861ec02f0c359bf0f59c2ff',
    reviewArea: {
      en: 'Blob cache read, write, prefix migration, and purge behavior.',
      zh: 'Blob 缓存读取、写入、前缀迁移和清除行为。',
    },
  },
  {
    source: 'src/lib/cached-read-route.ts',
    sourceSha256: '3b2fdf31075919e08b34514b6434906f39d9d20bea996da7f59bf42cacf36715',
    reviewArea: {
      en: 'Shared parameterless cached-read fixture, response, and public-error behavior.',
      zh: '共享无参数缓存读取的夹具、响应和公开错误行为。',
    },
  },
  {
    source: 'src/lib/bearer-auth.ts',
    sourceSha256: 'f9bb8619b6b9c3017fa780a8956aa7584fdd54d89f86f8335c295077cab71f4d',
    reviewArea: {
      en: 'Byte-safe constant-time Bearer credential comparison used by administration routes.',
      zh: '管理路由使用的字节安全恒定时间 Bearer 凭据比较。',
    },
  },
  {
    source: 'src/lib/public-api-errors.ts',
    sourceSha256: '48301bb3567870921f5cae0e0a35240c9a687767b89f96141b36be41afbaa16a',
    reviewArea: {
      en: 'Canonical public JSON error strings shared by handlers and OpenAPI examples.',
      zh: '处理程序与 OpenAPI 示例共享的规范公开 JSON 错误字符串。',
    },
  },
  {
    source: 'src/lib/eval-sample-params.ts',
    sourceSha256: '60073c6a3dcd7b4e16d2024606a2c7f457c35d127d89afaf361d382e198e88b9',
    reviewArea: {
      en: 'Shared stored/live evaluation sample filter and pagination behavior.',
      zh: '存储与实时评测样本共享的筛选和分页行为。',
    },
  },
  {
    source: 'src/lib/submissions-types.ts',
    sourceSha256: '1665a6a65f061184458997069b3222c9243b993f12573d83b0d10e571046a4bc',
    reviewArea: {
      en: 'Submission response topology and canonical database row type exports.',
      zh: '提交响应拓扑和规范数据库行类型导出。',
    },
  },
  {
    source: 'src/lib/benchmark-id.ts',
    sourceSha256: '36f9adf8a92cf5830abc01d0a389aa21eca9f429f31a9231b5d77e108c985d35',
    reviewArea: {
      en: 'Client-side persisted benchmark identifier recognition.',
      zh: '客户端持久化基准标识符识别。',
    },
  },
  {
    source: 'src/app/api/v1/id-routes.ts',
    sourceSha256: '7dde26440ea11d775aa0daca0a6a06671bfdd8cdcb75979ca56eff3c2b90f78c',
    reviewArea: {
      en: 'Shared positive-ID and ID-list validation, status codes, and error payloads for diagnostic reads.',
      zh: '诊断读取共享的正整数 ID 与 ID 列表校验、状态码和错误载荷。',
    },
  },
  {
    source: 'src/lib/api.ts',
    sourceSha256: '54e398a2041040ed7b66bd5c813041db26287111774dafd13a70d5e545fb24f3',
    reviewArea: {
      en: 'Public API client parameter serialization and TypeScript response contracts.',
      zh: '公开 API 客户端的参数序列化和 TypeScript 响应契约。',
    },
  },
  {
    source: 'src/lib/overview-data.ts',
    sourceSha256: '8ca280fec5bbe633493cf021fee294927aead799742ac07ac7dbe8c5092e38f2',
    reviewArea: {
      en: 'Overview BFF tier, engine, comparison-window, reference, and model-scope parameters plus the OverviewPageData response shape.',
      zh: '概览 BFF 的档位、引擎、对比时间窗口、参考硬件和模型范围参数，以及 OverviewPageData 响应结构。',
    },
  },
  {
    source: 'src/lib/tco-feed.ts',
    sourceSha256: '52d95a0c867513e6f6e3aaace4d066e69a28495ac593b89821b7b81d7475861a',
    reviewArea: {
      en: 'TCO workload, tier, score, point, and CSV/JSON response semantics.',
      zh: 'TCO 负载、档位、评分、数据点以及 CSV/JSON 响应语义。',
    },
  },
  {
    source: '../constants/src/models.ts',
    // Reviewed again for the release-date corrections: values inside
    // MODEL_RELEASE_DATES only. No published model name, alias, or parameter enum
    // is touched, and no endpoint exposes a release date, so the docs stand.
    sourceSha256: '9faf1ed1ed1712ee04741b6aa2291d42b2c202c2dadbb1a2681b5391da555e6c',
    reviewArea: {
      en: 'Published benchmark and TCO model names, aliases, and parameter enums.',
      zh: '已发布基准与 TCO 模型名称、别名和参数枚举。',
    },
  },
  {
    source: '../db/src/collectivex/types.ts',
    sourceSha256: '40079de1a9b1faef47cc72090331b9d2987f2895da34a77292f3bfcdf1dc5a64',
    reviewArea: {
      en: 'CollectiveX version negotiation and versioned dataset/run response types.',
      zh: 'CollectiveX 版本协商以及带版本的数据集与运行响应类型。',
    },
  },
  {
    source: '../db/src/etl/compute-request-timeline.ts',
    sourceSha256: '377d6f6cab10d6d7d59e7021d16e2ca872a2bfff6d28030966e1b36189d6bbc0',
    reviewArea: {
      en: 'Request timeline contract version, replay identity, source provenance, and event timing semantics.',
      zh: '请求时间线契约版本、重放标识、来源溯源和事件计时语义。',
    },
  },
  {
    source: '../db/src/queries/agentic-aggregates.ts',
    sourceSha256: 'fae8d19971730132cb30cd781f677562bfc6328b1f4e35a8268a8391ad187c18',
    reviewArea: {
      en: 'Agentic aggregate percentile keys, nullability, and ID-keyed response shape.',
      zh: '智能体汇总百分位字段、可空性和按 ID 索引的响应结构。',
    },
  },
  {
    source: '../db/src/queries/benchmark-siblings.ts',
    sourceSha256: '07d3d1bf93820091d1014b14bf954555edcec422c05e575ad87142f9845e4156',
    reviewArea: {
      en: 'Benchmark sibling SKU metadata and sibling navigation row shape.',
      zh: '基准同组 SKU 元数据和同组导航行结构。',
    },
  },
  {
    source: '../db/src/queries/benchmarks.ts',
    sourceSha256: '486e34d55275170c7e0544af24c151199752eb5628191d38606b1ecec289dfdf',
    reviewArea: {
      en: 'Benchmark row fields and latest, exact-run, history, and TCO query semantics.',
      zh: '基准行字段以及最新、精确运行、历史和 TCO 查询语义。',
    },
  },
  {
    source: '../db/src/queries/collectivex.ts',
    sourceSha256: '3eaf48a67933cfbda9068bc6367b16120fe46c28428dc1740763d6957a8365a0',
    reviewArea: {
      en: 'CollectiveX dataset projection, run summaries, coverage, series, and discovery state.',
      zh: 'CollectiveX 数据集投影、运行汇总、覆盖范围、序列和发现状态。',
    },
  },
  {
    source: '../db/src/queries/datasets.ts',
    sourceSha256: '34aba7d420ce651b6f04269a73466c3635d36a1a8c7eb63ae8e0f6b9e43b8685',
    reviewArea: {
      en: 'Dataset registry, detail, conversation index, pagination, and conversation structure responses.',
      zh: '数据集目录、详情、会话索引、分页和会话结构响应。',
    },
  },
  {
    source: '../db/src/queries/evaluations.ts',
    sourceSha256: '937f1329a40edda00012b8058b7f802629ba972de88585c29fedd1447c4d1929',
    reviewArea: {
      en: 'Evaluation aggregate result fields, provenance, metrics, and latest-attempt selection.',
      zh: '评测汇总结果字段、来源、指标和最新尝试选择。',
    },
  },
  {
    source: '../db/src/queries/latest-images.ts',
    sourceSha256: '80c69b9e9ed34e4279c6b95d8418c9535fcee1919ccb4883066d27954588c977',
    reviewArea: {
      en: 'Latest runtime image row fields and per-configuration selection.',
      zh: '最新运行时镜像行字段和按配置选择逻辑。',
    },
  },
  {
    source: '../db/src/queries/reliability.ts',
    sourceSha256: 'ccbdc07e16652e687e9feb239951a9e529ee24e2e1ea76a75f1458270ac30bd6',
    reviewArea: {
      en: 'Reliability success/total count fields and grouping semantics.',
      zh: '可靠性成功数/总数的字段和分组语义。',
    },
  },
  {
    source: '../db/src/queries/request-timeline.ts',
    sourceSha256: 'e27e2c421d94d55f8178756d31e9791d4143d33e4086f767e4ea15132a7ad708',
    reviewArea: {
      en: 'Request timeline metadata, request event records, units, and nullable timings.',
      zh: '请求时间线元数据、请求事件记录、单位和可空计时字段。',
    },
  },
  {
    source: '../db/src/queries/server-logs.ts',
    sourceSha256: '7a6f6b0b3c60e1713f73f6d543745931886654f060cf55d6dc4be9619a64b479',
    reviewArea: {
      en: 'Log filename discovery, selected-file reads, bounded chunk metadata, complete-file search, availability, and legacy-schema fallback.',
      zh: '日志文件名发现、指定文件读取、有界分块元数据、完整文件搜索、可用性以及旧版 schema 回退行为。',
    },
  },
  {
    source: '../db/src/queries/submissions.ts',
    sourceSha256: '0e234dd65414b31c5a60fd07ca9a3ac20fab03dcf9fa1c80d487f087a76d7e49',
    reviewArea: {
      en: 'Submission summary and daily hardware volume row fields.',
      zh: '提交汇总和每日硬件提交量行字段。',
    },
  },
  {
    source: '../db/src/queries/trace-availability.ts',
    sourceSha256: '838fb261a153e560b4c488b770deb47e57dd3ab3bfd5b98d32b2ec6fba79873e',
    reviewArea: {
      en: 'Trace availability ID-keyed boolean response shape.',
      zh: '跟踪可用性按 ID 索引的布尔响应结构。',
    },
  },
  {
    source: '../db/src/queries/trace-histograms.ts',
    sourceSha256: 'ec3b7358046ca2acdaaa56d8ecde2829ba8fe4f4b2b31c3795838ac85f59ca89',
    reviewArea: {
      en: 'Trace histogram input/output token arrays and ID-keyed response shape.',
      zh: '跟踪直方图输入/输出 token 数组和按 ID 索引的响应结构。',
    },
  },
  {
    source: '../db/src/queries/trace-server-metrics.ts',
    sourceSha256: 'da987d22521dc63da34dcacf3caaad6adb21aa6e5e7a65d1a4fa495a71e9f1f0',
    reviewArea: {
      en: 'Trace server metric metadata, time-series groups, source labels, and units.',
      zh: '跟踪服务器指标元数据、时间序列分组、来源标签和单位。',
    },
  },
  {
    source: '../db/src/queries/workflow-info.ts',
    sourceSha256: '7e7d6fc965a47655fe9fa6feb6d8282eff58c2aedca1bcdb59ac1e8c91128d31',
    reviewArea: {
      en: 'Availability rows plus workflow runs, changelogs, configurations, and run coverage responses.',
      zh: '可用配置行以及工作流运行、变更记录、配置和运行覆盖响应。',
    },
  },
] as const satisfies readonly ApiContractSourceDigest[];
