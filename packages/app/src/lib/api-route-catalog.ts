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
    source: 'src/app/api/v1/views/agentx-catalog/route.ts',
    path: '/api/v1/views/agentx-catalog',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-agentx-catalog-view',
    sourceSha256: '92eba2b07dbe19182a617faab46211de511974e8c81335c2dbc1b7c6b7795ab5',
  },
  {
    source: 'src/app/api/v1/views/agentx-point/route.ts',
    path: '/api/v1/views/agentx-point',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-agentx-point-view',
    sourceSha256: 'cd3352f94f2540bb3986c5004df238093c94a0de94202d90b7e88868f06dada0',
  },
  {
    source: 'src/app/api/v1/views/dataset/route.ts',
    path: '/api/v1/views/dataset',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-dataset-view',
    sourceSha256: '820a3ac1a79702dfde7b43136bb16a4b11bb6992afdc94087647dcf4c9defe0b',
  },
  {
    source: 'src/app/api/v1/views/evaluation-samples/route.ts',
    path: '/api/v1/views/evaluation-samples',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-evaluation-samples-view',
    sourceSha256: '9b99c398289043f36d6be24fb0bab7aba405a5a9520dc26b61709290a223737d',
  },
  {
    source: 'src/app/api/v1/views/cache-reuse/route.ts',
    path: '/api/v1/views/cache-reuse',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-cache-reuse-view',
    sourceSha256: 'c9a6a39307a62f04f822772e1cbe492de2dbd1b27dba67006f03a84fb278da10',
  },
  {
    source: 'src/app/api/v1/views/calculator/route.ts',
    path: '/api/v1/views/calculator',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-calculator-view',
    sourceSha256: '6edca6b89960a61aacef0091a47595b7c8d96a8de6a5d055080416c012dccc3b',
  },
  {
    source: 'src/app/api/v1/views/collectivex/route.ts',
    path: '/api/v1/views/collectivex',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-collectivex-view',
    sourceSha256: '6d9086dfa9bbeda39c194d0bbc0da96143be5acf8092b3f2e829826dfeff0982',
  },
  {
    source: 'src/app/api/v1/views/compare/route.ts',
    path: '/api/v1/views/compare',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-compare-view',
    sourceSha256: 'f762f11bd1551832e899c3c27b660ab9ad82312c14c634e13b73f86aafae986b',
  },
  {
    source: 'src/app/api/v1/views/current-inferencex-image/route.ts',
    path: '/api/v1/views/current-inferencex-image',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-current-inferencex-image-view',
    sourceSha256: '3a2eddb860c147214a76d4be01524713caf2eb741dbdf497e0fa21bb824e4d31',
  },
  {
    source: 'src/app/api/v1/views/evaluation/route.ts',
    path: '/api/v1/views/evaluation',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-evaluation-view',
    sourceSha256: '9281a35d293a340200894bcf63bd0d0400d9ca8edfe9bd8fc2a58ce90402ddde',
  },
  {
    source: 'src/app/api/v1/views/first-token/route.ts',
    path: '/api/v1/views/first-token',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-first-token-view',
    sourceSha256: 'a5920ea483e2c9ad551991e90272f16c807de23b2e72647e949dcab13ab353e5',
  },
  {
    source: 'src/app/api/v1/views/fleet/route.ts',
    path: '/api/v1/views/fleet',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-fleet-view',
    sourceSha256: 'ab0a5c408abb58976f193d53976b494cd54e026b5bebcb7bd119dc7187362bf0',
  },
  {
    source: 'src/app/api/v1/views/gpu-metrics/route.ts',
    path: '/api/v1/views/gpu-metrics',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-gpu-metrics-view',
    sourceSha256: '34860f3f64e4070bf4c0bf390c3b61f34bdb98b673a90d119bae162226dc1edd',
  },
  {
    source: 'src/app/api/v1/views/gpu-specs/route.ts',
    path: '/api/v1/views/gpu-specs',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-gpu-specs-view',
    sourceSha256: '8439c05e953392dc15d7fbd60e7426a5d52012f74bfe9662cb7e105a39f66a6a',
  },
  {
    source: 'src/app/api/v1/views/historical/route.ts',
    path: '/api/v1/views/historical',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-historical-view',
    sourceSha256: '365f8e46891b40d6e0c36995127c92f39d197992212178649211344eb89f2d6d',
  },
  {
    source: 'src/app/api/v1/views/inference/route.ts',
    path: '/api/v1/views/inference',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-inference-view',
    sourceSha256: '893bfe45a06731d58349e439af81bfe50132f04033faf4a067f66d44ad61103e',
  },
  {
    source: 'src/app/api/v1/views/operatorx/route.ts',
    path: '/api/v1/views/operatorx',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-operatorx-view',
    sourceSha256: 'a56b89364b11d4289f1b3684ee594df2b67e508ec8b0b5b83cde0f195caeb4a8',
  },
  {
    source: 'src/app/api/v1/views/options/route.ts',
    path: '/api/v1/views/options',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-view-options',
    sourceSha256: '79571c3e6faf5af977c1afc9c29ebd6c1bfeb54ccf389711fa49668466fb58f4',
  },
  {
    source: 'src/app/api/v1/views/overview/route.ts',
    path: '/api/v1/views/overview',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-overview-view',
    sourceSha256: '7c778f77e931bd40e29ddbfd80748119386ebcc01a680cd5296afd223c21b69a',
  },
  {
    source: 'src/app/api/v1/views/profit-estimator/route.ts',
    path: '/api/v1/views/profit-estimator',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-profit-estimator-view',
    sourceSha256: 'e0e6d7316cf605e9f9d6423523028b42f6cf7f0bff6d8339a00cac02653261e2',
  },
  {
    source: 'src/app/api/v1/views/profit-estimator-per-gigawatt/route.ts',
    path: '/api/v1/views/profit-estimator-per-gigawatt',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-profit-estimator-per-gigawatt-view',
    sourceSha256: '3b513949eb51668aa52b07324d2cecc5506f8167df05464e8269446715a9c734',
  },
  {
    source: 'src/app/api/v1/views/rankings/route.ts',
    path: '/api/v1/views/rankings',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-rankings-view',
    sourceSha256: '345eb8b3ffe7a9636edd70d8f3753fac6832753066afaa4ed71cf3cbcb7e1633',
  },
  {
    source: 'src/app/api/v1/views/reliability/route.ts',
    path: '/api/v1/views/reliability',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-reliability-view',
    sourceSha256: '74ad807a04ced873ab51c73fa647f6016b947778b76cc164b81ac6275846a1da',
  },
  {
    source: 'src/app/api/v1/views/submissions/route.ts',
    path: '/api/v1/views/submissions',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-submissions-view',
    sourceSha256: 'de777b985f67cfdcd282b3c06d617b7e0cc3f6f53b00df217163321ccbc05499',
  },
  {
    source: 'src/app/api/v1/views/video/route.ts',
    path: '/api/v1/views/video',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-video-view',
    sourceSha256: '566405f7db1eb5ea141b54384238e1b531bfe616c7fcd65b8653aed30d7ba007',
  },
  {
    source: 'src/app/api/v1/operatorx/runs/route.ts',
    path: '/api/v1/operatorx/runs',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-operatorx-runs',
    sourceSha256: 'f8e7049d1f3d16e3f4b6005b3c18eb9d1d427078b193e198d754a4e72fb516f7',
  },
  {
    source: 'src/app/api/v1/operatorx/runs/[runId]/route.ts',
    path: '/api/v1/operatorx/runs/{runId}',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-operatorx-run',
    sourceSha256: '8337605725c6aefab2df6853f1a04446fdfcf6083c536fd8cce49c2abd771262',
  },

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
    source: 'src/app/api/video-runs/route.ts',
    path: '/api/video-runs',
    method: 'GET',
    classification: 'ui-artifact-read',
    exclusionReason: {
      en: 'Hidden H3 viewer transport for live public CI runs and checksum-verified artifact ZIPs; uses the backend result contract rather than a published data API.',
      zh: '供隐藏的 H3 查看器实时读取公开 CI 运行及校验和已验证的产物 ZIP；依赖后端结果契约，不作为公开数据 API 发布。',
    },
    sourceSha256: '51278d05e223947e6a9c7b89b5f79a67afcd941ca091dbd794d3816c26805327',
  },
  {
    source: 'src/app/api/unofficial-run/route.ts',
    path: '/api/unofficial-run',
    method: 'GET',
    classification: 'ui-artifact-read',
    exclusionReason: {
      en: 'UI-only overlay for unofficial workflow artifacts. Development on loopback hosts may explicitly opt into local artifact files via INFERENCEX_LOCAL_ARTIFACT_DIR; production only reads the public GitHub source. Artifact availability and shape are not stable.',
      zh: '仅供界面叠加非官方工作流产物。开发环境通过本机地址访问时，可用 INFERENCEX_LOCAL_ARTIFACT_DIR 显式启用本地文件；生产环境仅从公开 GitHub 来源读取。产物的可用性和结构并不稳定。',
    },
    sourceSha256: '39c7d93afe59aa7def2c196713735908907496552be9afc3ec736cbc7133d582',
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
    sourceSha256: '78ed7172c54119f8a1d29be6d15ac8277de97180767286d07c14a331e354ec57',
  },
  {
    source: 'src/app/api/v1/benchmarks/history/route.ts',
    path: '/api/v1/benchmarks/history',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-benchmark-history',
    sourceSha256: '7550e6691d4b2f1061278580b4d3b81c55494839970d4b94a6a49a1455834ea9',
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
    sourceSha256: '221595d4b046d0ecaff6efd7d47f8a02c8b85ff426890599892c3ab82ee96aa6',
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
      en: 'Page-owned live artifact reader; the documented public sample projection is /api/v1/views/evaluation-samples.',
      zh: '页面内部使用的实时产物读取接口；公开样本投影由 /api/v1/views/evaluation-samples 提供。',
    },
    sourceSha256: 'd5b8c36466c5882fa253e653997c7c4dd181489d754aca6fef1f98aaa103cf65',
  },
  {
    source: 'src/app/api/v1/eval-samples/route.ts',
    path: '/api/v1/eval-samples',
    method: 'GET',
    classification: 'ui-artifact-read',
    exclusionReason: {
      en: 'Page-owned stored-sample reader; the documented public drawer projection is /api/v1/views/evaluation-samples.',
      zh: '页面内部使用的已存储样本读取接口；公开详情投影由 /api/v1/views/evaluation-samples 提供。',
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
    sourceSha256: 'a72e44393ff478d18973a050b009bdbaa9e5e5929837dac3781970d162b4de77',
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
      en: 'Page-owned compact wire format; /api/v1/views/agentx-point publishes decoded, phase-scoped request fields instead.',
      zh: '页面内部使用的精简传输格式；/api/v1/views/agentx-point 公开解码后按阶段筛选的请求字段。',
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
      en: 'Page-owned lazy metric-source reader; /api/v1/views/agentx-point exposes the selected source through its documented source parameter.',
      zh: '页面内部使用的指标来源按需读取接口；/api/v1/views/agentx-point 通过已文档化的 source 参数公开所选来源。',
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
    parameters: ['model', 'date', 'exact', 'runId', 'exactRun', 'view', 'sequence', 'powerValid'],
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
    source: 'src/lib/views-api/agentx-charts.ts',
    sourceSha256: '5f4515d2d0cfd7cd6a0f19f9b69eca7c3b97ac38bc32ed3f0dde2d575772f397',
    reviewArea: {
      en: 'AgentX chart controls and numerical projections.',
      zh: 'AgentX 图表控制项与数值投影。',
    },
  },
  {
    source: 'src/components/inference/agentic-point/time-series-math.ts',
    sourceSha256: '4dcf086737628a24e342d6793b35810f40f07e2fec239474c5827d6cddfb8ab0',
    reviewArea: {
      en: 'Shared request/server chart estimators and populations.',
      zh: '请求与服务端图表共用的估计方法和样本范围。',
    },
  },
  {
    source: 'src/components/inference/agentic-point/lognormal.ts',
    sourceSha256: '04a4b30d1bf5a4b124e72d3c9a6c49a3968c7cab5f1dc1607211f026155247d9',
    reviewArea: {
      en: 'Shared log histogram binning and zero exclusions.',
      zh: '共用的对数直方图分箱与零值排除规则。',
    },
  },
  {
    source: 'src/lib/views-api/detail-params.ts',
    sourceSha256: '6005473e305cbb252b76e3748c101d6ca882cd0abfdb50b8966cdc51876f4153',
    reviewArea: { en: 'Strict public drilldown selectors.', zh: '公开详情接口的严格参数校验。' },
  },
  {
    source: 'src/lib/eval-sample-search.ts',
    sourceSha256: '3f56dcedeb2db7fbf70a6d6545f775ac3de3efb2e58bc6af95d6eed45485a693',
    reviewArea: { en: 'Page-local evaluation sample search.', zh: '评估样本的页内搜索。' },
  },
  {
    source: 'src/lib/gpu-specs-radar.ts',
    sourceSha256: '7b75204cabe6972b8cfba73569ced46d5921288b1a8a04b0f9eced4e7068d205',
    reviewArea: {
      en: 'All-chip radar normalization and missing values.',
      zh: '雷达图基于全部芯片归一化及缺失值处理。',
    },
  },
  {
    source: 'src/lib/request-chart-data.ts',
    sourceSha256: '20c6844d9609b063fa018a604e76506165b34eaa32a6bb3908e94c5fa6e9b2fa',
    reviewArea: {
      en: 'Public request projection decoding and units.',
      zh: '公开请求投影的解码与单位。',
    },
  },
  {
    source: 'src/components/datasets/trace-flamegraph-model.ts',
    sourceSha256: 'fa9189805922833b773801ca57a8b95c9434cdff73219e7539e83daff978c3e0',
    reviewArea: {
      en: 'Conversation rows, overlap brackets and deep-link targets.',
      zh: '对话行、重叠标记及深层链接目标。',
    },
  },
  {
    source: 'src/components/inference/agentic-point/phase-slice.ts',
    sourceSha256: '3e4d8c35594b6fba9c81b3e8f8a574410447f9bd710a92a8e953e65b59db61a4',
    reviewArea: {
      en: 'Request and server phase origins and slicing.',
      zh: '请求和服务端阶段的时间原点与切片。',
    },
  },
  {
    source: 'src/lib/agentic-catalog.ts',
    sourceSha256: '4a72937000acf5ffb755311be19ecf20d2651bc62bca755b658ed2f0e46c0fbb',
    reviewArea: {
      en: 'Public telemetry catalog grouping and representative points.',
      zh: '公开遥测目录的分组与代表性数据点。',
    },
  },
  {
    source: 'src/lib/views-api/upstream-error.ts',
    sourceSha256: 'c3f1b4c318e1ae771a67edd85f16d69b7316461334604fd8c892254eface715a',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/video-benchmark/view-selection.ts',
    sourceSha256: '6025e0ebefaef52e5e7475e2d6584562cb32037e0d7dd4ff43baeef8646d58f4',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/operatorx/view-data.ts',
    sourceSha256: 'b491ba1680785fd9e732279f05807d0d108674e3db899fdd1e30318f081a007d',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/gpu-power/chart-data.ts',
    sourceSha256: '34bdab18810a5e6688d150b71c4c1b22d383a63775672c0c915549b841c48475',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/evaluation/date-resolution.ts',
    sourceSha256: 'f1a3d397939d94a17e624c89a9f167c0109e37c8cbc32f902f426bada87529e1',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/reliability/aggregate.ts',
    sourceSha256: '23f2d9bbc4c5be22193d1a59b6783326fee8ca636ed5f1e9d18115bc9854b37b',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/inference/hooks/interpolated-trend-core.ts',
    sourceSha256: '1710096c62382b30f8ed581cc0464f8e71900502385d0cee55825a088c05ac5f',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/inference/hooks/chart-data-core.ts',
    sourceSha256: '0c86987ed025557172a8d020144ca462be1ecac880d53b7d929f93a617086c33',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/calculator/power-ranking.ts',
    sourceSha256: '73baa910ef486df30237222a1280658a87bae544592fd700782eb6308efa6ca8',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/calculator/throughput-data.ts',
    sourceSha256: '4d12f2f267c939def090843b2f221a9ae5d92956b8307c4866ef6c09065096aa',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/errors.ts',
    sourceSha256: '5b70ecd63603f39a3d887961f8e172752efb3cb4600e7d9fd4412479031b2e88',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/calculator-extensions.ts',
    sourceSha256: '0e2b050b483b505b9118336f6639594c8f82470e885c6356c4f2dc5790d39fec',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/source.ts',
    sourceSha256: '174a843bcc17d2c8bafd49c7e9a382a1bdfb95ac14a2a11e2f0e3d6c99958408',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/series.ts',
    sourceSha256: 'b5ebddee9d9ea6b85a8fdab2cf8fcc50bbf05e0fa10564987698abd38a6d4488',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/registry.ts',
    sourceSha256: '65323677e9524354a1cdf6661a49a731f9a92c86f865a5ad29ce74ca48851117',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/params.ts',
    sourceSha256: 'bfc42a782e1c4a67d5a07b38bb4ebf8ae662a965a4959eed34adc8ba4a00369f',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/operatorx-ingest.ts',
    sourceSha256: 'bec2e115e006457816fc8e915b51128ea57b1c481b06b50fb4698ec37d94b425',
    reviewArea: {
      en: 'OperatorX provenance, run discovery, raw persistence, coverage, per-GPU GEMM, attention and routed MoE throughput, and latency.',
      zh: 'OperatorX 来源校验、运行发现、原始数据持久化、覆盖情况、GEMM、attention 和路由 MoE 单卡吞吐量及延迟。',
    },
  },
  {
    source: '../db/src/operatorx/reader.ts',
    sourceSha256: '4aa675bbf8e8f33ffe11d3ba322374c712cc721314b657478b25321bb3548d7b',
    reviewArea: {
      en: 'OperatorX provenance, run discovery, raw persistence, coverage, per-GPU GEMM, attention and routed MoE throughput, and latency.',
      zh: 'OperatorX 来源校验、运行发现、原始数据持久化、覆盖情况、GEMM、attention 和路由 MoE 单卡吞吐量及延迟。',
    },
  },
  {
    source: '../db/src/queries/operatorx.ts',
    sourceSha256: '104621edcb978e23a1a32a5a4c4bb57e2eafdc2058d67953aebc34c4b7c15e6f',
    reviewArea: {
      en: 'OperatorX provenance, run discovery, raw persistence, coverage, per-GPU GEMM, attention and routed MoE throughput, and latency.',
      zh: 'OperatorX 来源校验、运行发现、原始数据持久化、覆盖情况、GEMM、attention 和路由 MoE 单卡吞吐量及延迟。',
    },
  },
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
    sourceSha256: 'd80b18da9bae84079764238fb586090b26aff5eeddfea1a152ef735889bd3357',
    reviewArea: {
      en: 'Public API client parameter serialization and TypeScript response contracts.',
      zh: '公开 API 客户端的参数序列化和 TypeScript 响应契约。',
    },
  },
  {
    source: 'src/lib/overview-data.ts',
    // Reviewed for the DeepSeek-V4.1-Flash addition (InferenceX#2961): the
    // model joins OVERVIEW_MODEL_SCENARIOS as AgentX-only. Curated scenario
    // data, no parameter or OverviewPageData shape change, so the docs stand.
    sourceSha256: '7a4e7961b26e9f09d4d9bb9ef9b2b1da77a138490625483de49abc15480f3fe1',
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
    // Reviewed for the Qwen3.8-27B addition (InferenceX#3260): two new DB keys
    // and display names plus their release dates. No published parameter enum
    // or endpoint changes, so the docs stand.
    // Reviewed for the GLM-5.3 DB key (InferenceX#3330): one new key, `glm5.3`,
    // mapped to the existing GLM-5.2 display name (as glm5.1 -> GLM-5). No
    // published parameter enum or endpoint changes, so the docs stand.
    sourceSha256: 'bdc8e287f57107cdf0772c50ad4abc0278757b20db78844cc6cf02e88ea66717',
    reviewArea: {
      en: 'Published benchmark and TCO model names, aliases, and parameter enums.',
      zh: '已发布基准与 TCO 模型名称、别名和参数枚举。',
    },
  },
  {
    source: '../db/src/collectivex/types.ts',
    sourceSha256: 'a4478f8c939f20a31c2e862348e03ad24990a43f90550fc567df8f19aea69799',
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
    sourceSha256: '8d23f65dfb77565120f23207729ed66e6ce55f53acf6bf0cf51e377c41120d6b',
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
    sourceSha256: '5e3fec29e193c9b7964fa3faf2226112aa5ac30cc8f5e5fff13d298909cdd8fc',
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
    sourceSha256: '98659d61fdfb73d955fd84ead82deaa51076b792ad73b0c111af4d7e512749f5',
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
    sourceSha256: '4f70c310675c36ce062fe78861925f0a9e99b05396a6d2b5d0afc9221a89edd7',
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
