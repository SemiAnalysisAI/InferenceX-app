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
    sourceSha256: '28e6cee4d67396ee8ea2e5a7e18271c6ee86228c33f33a20bf573f3a601ba8ed',
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
    sourceSha256: 'ef85fec8468757b0122c5fcebde78527c2efe62f9fedc95799cad56a457a8f04',
  },
  {
    source: 'src/app/api/v1/agentic-aggregates/route.ts',
    path: '/api/v1/agentic-aggregates',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-agentic-aggregates',
    sourceSha256: '6a99fc156b02b86c5c26ca5ba6b05a280e064dd6123aaba528f124ff0f13c577',
  },
  {
    source: 'src/app/api/v1/availability/route.ts',
    path: '/api/v1/availability',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-availability',
    sourceSha256: '12bc0fa8930792897ed8300bd3be1333826b51903c04c6fbdec335f13d80ca7a',
  },
  {
    source: 'src/app/api/v1/benchmark-siblings/route.ts',
    path: '/api/v1/benchmark-siblings',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-benchmark-siblings',
    sourceSha256: '36b00e5d1c761e6a76e2c0454d9be4a15b7ccb7f3af5bdccd8ac61b6e5ff5312',
  },
  {
    source: 'src/app/api/v1/benchmarks/route.ts',
    path: '/api/v1/benchmarks',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-benchmarks',
    sourceSha256: '37b5a31613a9c5a2e1de35758551dfdbbb8b920fcd6ae6baeedf973c8802bc2c',
  },
  {
    source: 'src/app/api/v1/benchmarks/history/route.ts',
    path: '/api/v1/benchmarks/history',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-benchmark-history',
    sourceSha256: 'd4b3d2ad8ed6e35df70c6b651f71c9d86b6e1dad9c3eaf6eadc2a8591318d1fb',
  },
  {
    source: 'src/app/api/v1/collectivex/latest/route.ts',
    path: '/api/v1/collectivex/latest',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-collectivex-latest',
    sourceSha256: '41c67c25c62ae2bad5f2ef16faf7a3e5a5c4440a53e3701ae68cf0fdb0973f18',
  },
  {
    source: 'src/app/api/v1/collectivex/runs/route.ts',
    path: '/api/v1/collectivex/runs',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-collectivex-runs',
    sourceSha256: 'bce17c290c75ddae3300125b4cefec684f58748cbd524dd4b6916e2728660f23',
  },
  {
    source: 'src/app/api/v1/collectivex/runs/[runId]/route.ts',
    path: '/api/v1/collectivex/runs/{runId}',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-collectivex-run',
    sourceSha256: 'dabbf260d406f774a880ea4c19c25271775755107ada6d036e2cf6b13f818cbb',
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
    sourceSha256: 'dabbf260d406f774a880ea4c19c25271775755107ada6d036e2cf6b13f818cbb',
  },
  {
    source: 'src/app/api/v1/datasets/route.ts',
    path: '/api/v1/datasets',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-datasets',
    sourceSha256: '22eb9d7bb5f91d64a19d43723c4be73c239513073819ad5af83864a3b4858505',
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
    sourceSha256: '7790c89e48b71f0cb2a819f34ec649ce300982fa41bba20a2b996b6c9768b6c7',
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
    sourceSha256: '0e05c3d98153a53e5025e6c9973ac6a0eef294ad8cb6ac8748b9a1478067b233',
  },
  {
    source: 'src/app/api/v1/evaluations/route.ts',
    path: '/api/v1/evaluations',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-evaluations',
    sourceSha256: '8eab5b9d1df62b64b89458943d6e2182b62713c22421a30f427044f664b76b04',
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
    sourceSha256: 'b081b54a5960e6da0987e9ccee777bfbc40c03d0206823472ee7d0f0e969e8d7',
  },
  {
    source: 'src/app/api/v1/latest-images/route.ts',
    path: '/api/v1/latest-images',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-latest-images',
    sourceSha256: '67e50209f2a1200b56e418c9edc29eba955e6c1273319f98a2deb8657b79e895',
  },
  {
    source: 'src/app/api/v1/overview/route.ts',
    path: '/api/v1/overview',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Page-owned BFF aggregation whose tier, comparison, and calculator projections are coupled to the overview UI.',
      zh: '由页面拥有的 BFF 聚合；其档位、比较和计算器投影与概览界面紧密耦合。',
    },
    sourceSha256: '7c9830baae39d533ba7db36d44fe520f89cb36b32ffc54ef29404693d0b6b120',
  },
  {
    source: 'src/app/api/v1/reliability/route.ts',
    path: '/api/v1/reliability',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-reliability',
    sourceSha256: 'fe295d04ecf45bfcbd5d59518eb9a5b04a7f460a95053d79f7f904502d39d189',
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
    source: 'src/app/api/v1/server-log/route.ts',
    path: '/api/v1/server-log',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-server-log',
    sourceSha256: '0462679b059bb8e2c48507e147faa24389a76b04312f06dbf9ab3724352a1239',
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
    source: 'src/app/api/v1/trace-server-metrics/route.ts',
    path: '/api/v1/trace-server-metrics',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-trace-server-metrics',
    sourceSha256: 'b1bb5b859a28ec18abd0b4ddebf5e505974a08b7ed9693e5bab118f4533f3ce6',
  },
  {
    source: 'src/app/api/v1/workflow-info/route.ts',
    path: '/api/v1/workflow-info',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-workflow-info',
    sourceSha256: 'b7b0f215e9bf2c766ce2d4c9a13090504c1704a67f697af3a2fd1f318de1e6d6',
  },
] as const satisfies readonly ApiRouteCatalogEntry[];

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
    source: 'src/app/api/v1/id-routes.ts',
    sourceSha256: '65a8ebf97d500fd4164e068dc7d303d82e74e5ed84301dcd19ef8d386317b721',
    reviewArea: {
      en: 'Shared positive-ID and ID-list validation, status codes, and error payloads for diagnostic reads.',
      zh: '诊断读取共享的正整数 ID 与 ID 列表校验、状态码和错误载荷。',
    },
  },
  {
    source: 'src/lib/api.ts',
    sourceSha256: '03809377af6c2ee938169a065e06dccb25d983d7171a54b998ffa08dd970d306',
    reviewArea: {
      en: 'Public API client parameter serialization and TypeScript response contracts.',
      zh: '公开 API 客户端的参数序列化和 TypeScript 响应契约。',
    },
  },
  {
    source: 'src/lib/overview-data.ts',
    sourceSha256: '7757b32c1769bf4e25e8dd156ba049830ab25b8e3cf345d718cfad46adfd8e43',
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
    sourceSha256: 'dca2b25f754adf90ac1bda31c5eb52503e3b3e8c72e684f10724c177c1317fac',
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
    sourceSha256: '7cf9d1ab318ca9c21d9200ca4347437ce9f7bb3159bedb29a169cdf6ba46baae',
    reviewArea: {
      en: 'Request timeline contract version and event timing field semantics.',
      zh: '请求时间线契约版本和事件计时字段语义。',
    },
  },
  {
    source: '../db/src/queries/agentic-aggregates.ts',
    sourceSha256: 'b0f4be6c39fe440df99db687b4b6deeed58897bf20325770631680f6e41aa304',
    reviewArea: {
      en: 'Agentic aggregate percentile keys, nullability, and ID-keyed response shape.',
      zh: '智能体汇总百分位字段、可空性和按 ID 索引的响应结构。',
    },
  },
  {
    source: '../db/src/queries/benchmark-siblings.ts',
    sourceSha256: '5a2b7e902c3003a0b3dbf3f402cc4b6b40648a1e014a218ab39dcbfd35c80f42',
    reviewArea: {
      en: 'Benchmark sibling SKU metadata and sibling navigation row shape.',
      zh: '基准同组 SKU 元数据和同组导航行结构。',
    },
  },
  {
    source: '../db/src/queries/benchmarks.ts',
    sourceSha256: 'bb2f2cd28d8e4cea7b556561235da43d6a33363dc2c6d1f0b13408193d04298e',
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
    sourceSha256: '05b0f990f8aeb1061fb0bfe7204f1c015fc55b0a541249188ffe740edf2a5af6',
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
    sourceSha256: '5373c839e1290d5ce1fde420041028325418597e0c911b212368f2f839756fa2',
    reviewArea: {
      en: 'Request timeline metadata, request event records, units, and nullable timings.',
      zh: '请求时间线元数据、请求事件记录、单位和可空计时字段。',
    },
  },
  {
    source: '../db/src/queries/server-logs.ts',
    sourceSha256: '44a4a55283fe4952e07df4034abf6a211d055225aee510ef3e6a945c72b63b55',
    reviewArea: {
      en: 'Server log lookup result fields and missing-record behavior.',
      zh: '服务器日志查询结果字段和记录缺失行为。',
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
    sourceSha256: '43d11e53abc4f9ba723c987424823a03fc8f5dde51cf11653ab8c0bf3a634f55',
    reviewArea: {
      en: 'Trace histogram input/output token arrays and ID-keyed response shape.',
      zh: '跟踪直方图输入/输出 token 数组和按 ID 索引的响应结构。',
    },
  },
  {
    source: '../db/src/queries/trace-server-metrics.ts',
    sourceSha256: '06b5a9b92b90a5e695ab6c1dfb4b4d1240180f8d306ff4523ea8cc4269b0ddf3',
    reviewArea: {
      en: 'Trace server metric metadata, time-series groups, source labels, and units.',
      zh: '跟踪服务器指标元数据、时间序列分组、来源标签和单位。',
    },
  },
  {
    source: '../db/src/queries/workflow-info.ts',
    sourceSha256: 'b6611604d41ab69c00cb804ad255d4cbc9f70e41e84ad43330538558956f9eb6',
    reviewArea: {
      en: 'Availability rows plus workflow runs, changelogs, configurations, and run coverage responses.',
      zh: '可用配置行以及工作流运行、变更记录、配置和运行覆盖响应。',
    },
  },
] as const satisfies readonly ApiContractSourceDigest[];
