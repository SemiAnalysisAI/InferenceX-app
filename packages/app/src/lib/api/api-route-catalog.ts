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
    source: 'src/app/api/v1/views/model-architectures/route.ts',
    path: '/api/v1/views/model-architectures',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-model-architectures-view',
    sourceSha256: 'f9bc4c6fd4f895f36695f969e2cdf3978a9751afcb3bdf55e3a64b2eb5ba6645',
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
    sourceSha256: '3d28ca187d502472c5754d0d29276ab9d717f08c8948db6900b83079323bebe5',
  },
  {
    source: 'src/app/api/v1/views/collectivex/route.ts',
    path: '/api/v1/views/collectivex',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-collectivex-view',
    sourceSha256: 'f78417947e59d785bde54dff09e3ca7374e0427712374bfc173992ff6af1641c',
  },
  {
    source: 'src/app/api/v1/views/compare/route.ts',
    path: '/api/v1/views/compare',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-compare-view',
    sourceSha256: '9939ff7d37fe1de61577459b52cb6e9267f09f6555b57b9eae2ff17e6a1bfa18',
  },
  {
    source: 'src/app/api/v1/views/current-inferencex-image/route.ts',
    path: '/api/v1/views/current-inferencex-image',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-current-inferencex-image-view',
    sourceSha256: '62041a341abf85949ec643f4a8bfbeb5fb916775458b85a7bdbc3fad1607378a',
  },
  {
    source: 'src/app/api/v1/views/evaluation/route.ts',
    path: '/api/v1/views/evaluation',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-evaluation-view',
    sourceSha256: '38166deb4a4763f54d43e755f075b236765b554d2c11e767ce8366458f1fc05b',
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
    sourceSha256: '0cfbf9653ba0e5fd121849c1b82a45baa0788812848cc208732b5043657390f4',
  },
  {
    source: 'src/app/api/v1/views/gpu-metrics/route.ts',
    path: '/api/v1/views/gpu-metrics',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-gpu-metrics-view',
    sourceSha256: 'b5f9de381bb588faafa7af9ca193030d73248394332e387a77f025a51c9f961c',
  },
  {
    source: 'src/app/api/v1/views/gpu-specs/route.ts',
    path: '/api/v1/views/gpu-specs',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-gpu-specs-view',
    sourceSha256: '65fd28d72582f2b97d79ddd8dc2b809136f867c9c6537f7080b08295fe8249ac',
  },
  {
    source: 'src/app/api/v1/views/historical/route.ts',
    path: '/api/v1/views/historical',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-historical-view',
    sourceSha256: 'd2f7768ffee4a60618ac4f9add87bbe571cc668424eb8d9f257d78fe82a546fb',
  },
  {
    source: 'src/app/api/v1/views/inference/route.ts',
    path: '/api/v1/views/inference',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-inference-view',
    sourceSha256: '18d6658379e045492907836358cf5c29a1d901af6189498b519266c249244674',
  },
  {
    source: 'src/app/api/v1/views/options/route.ts',
    path: '/api/v1/views/options',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-view-options',
    sourceSha256: '2ebc71f82cc22912f634c41a1c764cc697d515554c9c78cc74cf537f035c6486',
  },
  {
    source: 'src/app/api/v1/views/overview/route.ts',
    path: '/api/v1/views/overview',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-overview-view',
    sourceSha256: 'b75d73e47c0d61319a67b19556d64c861c423af91e381cc0356606316b5809c6',
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
    sourceSha256: '02a664680767b1168e1ca32d250a6356f9a490ab56106e5cee1c5692d50f5a8c',
  },
  {
    source: 'src/app/api/v1/views/reliability/route.ts',
    path: '/api/v1/views/reliability',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-reliability-view',
    sourceSha256: 'f97eb40d65e999b80d8738aa24718da9a7e733555da6e6bea231c0a31cf63a0c',
  },
  {
    source: 'src/app/api/v1/views/submissions/route.ts',
    path: '/api/v1/views/submissions',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-submissions-view',
    sourceSha256: 'cb183903e42941a66272deb3571a0750f264d3f917aff28a4f48f63566ade17e',
  },
  {
    source: 'src/app/api/v1/views/video/route.ts',
    path: '/api/v1/views/video',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-video-view',
    sourceSha256: '566405f7db1eb5ea141b54384238e1b531bfe616c7fcd65b8653aed30d7ba007',
  },
  // Agentic Workload Explorer page backend (frozen ProxyTrace snapshot).
  {
    source: 'src/app/api/v1/agentic-workload-explorer/cache/route.ts',
    path: '/api/v1/agentic-workload-explorer/cache',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '370214e2ea83499c508d1856e2c8961150aba2c20d54c8ca21b5ba24756ab2c5',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/cache/heatmap/route.ts',
    path: '/api/v1/agentic-workload-explorer/cache/heatmap',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '07c479c3a0ec7d1c94d1cda29a79ecdfb3eb9bb83fea7db380999423c46a978e',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/costs/route.ts',
    path: '/api/v1/agentic-workload-explorer/costs',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: 'dc520d1902bf3a1a2a575d07ca19d6836e40e7bc12edadd05fad6c1cbc644e86',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/errors/route.ts',
    path: '/api/v1/agentic-workload-explorer/errors',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '005d87694eebf066477903a1eb2ca458ad8d1fd7b00a606a05b288f8fa524537',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/fast-mode/route.ts',
    path: '/api/v1/agentic-workload-explorer/fast-mode',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '46716a72bf3cec5e1c08caf6dda5c886e30e01010c8f422d66c2c687f1af82bc',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/graphs/route.ts',
    path: '/api/v1/agentic-workload-explorer/graphs',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '46abe3b1f7987e6aac38597cb9005d588c450af609c9105c8ca7766640efba09',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/harnesses/route.ts',
    path: '/api/v1/agentic-workload-explorer/harnesses',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '5eaa5404736bf2e67050e8c1d0eff04df3c42d36e89e3efa2f673069636c7b8d',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/latency/route.ts',
    path: '/api/v1/agentic-workload-explorer/latency',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '89422bfc202739688f35d19c0e5380aa81bb19d9543f8d3600c211643868552f',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/models/route.ts',
    path: '/api/v1/agentic-workload-explorer/models',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '965cf0517fc20ba13fe65fea9ffb4380e1a85b1039b08186d9ac39b0511a46cf',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/overview/route.ts',
    path: '/api/v1/agentic-workload-explorer/overview',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '43ff1d2c7db95c428569262a5a8effbb7697acdf91c3d353651b6e293dc64299',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/platform/route.ts',
    path: '/api/v1/agentic-workload-explorer/platform',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: 'aecf2db2cfccbd990bceba07c89d92265f7f73a2ea2d36c91af10474910af29f',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/proxy-health/route.ts',
    path: '/api/v1/agentic-workload-explorer/proxy-health',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: 'b7d543b31e29a7f902029a67034ae94fb9c913e47dd3e468673e97d40cfae4f6',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/requests/[id]/hash-ids/route.ts',
    path: '/api/v1/agentic-workload-explorer/requests/{id}/hash-ids',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: 'd0c295e551207552e8e9cba0d015afaad2be0d224658f3388edf6d81c680ea78',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/rps/route.ts',
    path: '/api/v1/agentic-workload-explorer/rps',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: 'c7fe747051c826efd14897da8ae11a13de2f9ad5bccc0f0fad2e3571713c2808',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/session-insights/route.ts',
    path: '/api/v1/agentic-workload-explorer/session-insights',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '0c8703e7d056fe13fea239ce400be49bbca8ea59e12e539fa5e49058db9c4a32',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/session-reuse/route.ts',
    path: '/api/v1/agentic-workload-explorer/session-reuse',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: 'a18261a34726be9475a27a240bde43db5b46ae270bbb0a6b528af14f3fd472f2',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/sessions/route.ts',
    path: '/api/v1/agentic-workload-explorer/sessions',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: 'b91dc0ffd6405d8b6602b7334644cc0f60efa24aeb684c6198595dcc717bec20',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/sessions/[id]/route.ts',
    path: '/api/v1/agentic-workload-explorer/sessions/{id}',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '7f8a78150b2e45a1bd12c1f811cd3cd3e5cb8d92e9614bad633f054fcdd547c5',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/sessions/[id]/hash-stats/route.ts',
    path: '/api/v1/agentic-workload-explorer/sessions/{id}/hash-stats',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '420e8c77979b7736ce24645299dff889d4fe108dd3a9809c32ce03ef8d1e1db8',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/sessions/[id]/stats/route.ts',
    path: '/api/v1/agentic-workload-explorer/sessions/{id}/stats',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '82b7adce40b7b93e870a052a8f7bbc5f72ac59689e92adb74483c4c8f6995840',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/streaming/route.ts',
    path: '/api/v1/agentic-workload-explorer/streaming',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '9ee7e049d30950b8a94b86e75bcafbf63f9551d9bbcb50519e7374ded4775e30',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/tool-analytics/route.ts',
    path: '/api/v1/agentic-workload-explorer/tool-analytics',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '1afd518ebafefc63833779726062317685c21ef434de675a7da65f123ad60217',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/tool-analytics/sequences/route.ts',
    path: '/api/v1/agentic-workload-explorer/tool-analytics/sequences',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '1be4d1eaec96688c9a53bc6a6c5d80904601d92c9c40212de64d8bd2ddb47c3c',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/traffic/route.ts',
    path: '/api/v1/agentic-workload-explorer/traffic',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '6d628b258d8460f29ce46688920df318d9a7e2ebcc763cb9a781e1741a031081',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/trends/route.ts',
    path: '/api/v1/agentic-workload-explorer/trends',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '51f8b316a9963d16073bcba950c827af19b8c5c7a91c093f4a474f42e9b6085b',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/trends/harness-versions/route.ts',
    path: '/api/v1/agentic-workload-explorer/trends/harness-versions',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '686aab16e8e71b5f5a48eb1c63dfd331de637090e178483fd01b29eb81da03ba',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/web-search/route.ts',
    path: '/api/v1/agentic-workload-explorer/web-search',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '48c4e1c195df50347807518ab2adc7db259bb77400898fde705da18a433b9d65',
  },
  // End Agentic Workload Explorer page backend.
  {
    source: 'src/app/api/v1/views/ubenchx/route.ts',
    path: '/api/v1/views/ubenchx',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-ubenchx-view',
    sourceSha256: '9a0d19efcf5a8ef8949fd0439740c16de2a59aa66be4f9e5e77e89927ada0475',
  },
  {
    source: 'src/app/api/v1/operatorx/runs/route.ts',
    path: '/api/v1/operatorx/runs',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'OperatorX page backend; its run, result and detail shapes follow the page while it is being redesigned.',
      zh: 'OperatorX 页面后端；页面重新设计期间，其运行、结果和详情结构随页面变化。',
    },
    sourceSha256: '789408af159e6572cddf4ecb39fe315d06e5e1419d20e1a38c02ad945c7012ad',
  },
  {
    source: 'src/app/api/v1/operatorx/runs/[runId]/route.ts',
    path: '/api/v1/operatorx/runs/{runId}',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'OperatorX page backend; its run, result and detail shapes follow the page while it is being redesigned.',
      zh: 'OperatorX 页面后端；页面重新设计期间，其运行、结果和详情结构随页面变化。',
    },
    sourceSha256: '77209acbbeccced6b8e4d91511aaa856da3acaa01c6e0f8515760f37d8412284',
  },
  {
    source: 'src/app/api/v1/operatorx/runs/[runId]/results/[index]/route.ts',
    path: '/api/v1/operatorx/runs/{runId}/results/{index}',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'OperatorX page backend; its run, result and detail shapes follow the page while it is being redesigned.',
      zh: 'OperatorX 页面后端；页面重新设计期间，其运行、结果和详情结构随页面变化。',
    },
    sourceSha256: '7e7baae2d1560af0611e4e2f5d15fbb53b4e1acfe703e781e922e0dc244c6d61',
  },
  {
    source: 'src/app/api/v1/operatorx/compare/route.ts',
    path: '/api/v1/operatorx/compare',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'OperatorX page backend; comparisons include hardware references, defaults, optional distribution quantiles and per-hardware or shared-cohort roofline median/best summaries with resolved controls.',
      zh: 'OperatorX 页面后端；对比结果包含硬件参考值和默认设置，并可按需返回分布分位数及基于各硬件自身用例或共同用例的 roofline 中位数与最佳值汇总，同时附带实际生效的参数。',
    },
    sourceSha256: 'a80b749f58ba741aa7ac5ec6654b1290e1afb8f00e38f1411eb965a9db3e36f4',
  },
  {
    source: 'src/app/api/v1/operatorx/timelines/route.ts',
    path: '/api/v1/operatorx/timelines',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'OperatorX page backend; serves the case drill-down kernel timelines in the page’s own compact shape.',
      zh: 'OperatorX 页面后端；以页面自身的紧凑结构提供用例详情的 kernel 时间线。',
    },
    sourceSha256: 'c41b25c899b181bd5d687c795d12b74b8b279bbf55ee7e7b4c77f6d46abeff26',
  },

  {
    source: 'src/app/api/v1/pareto/route.ts',
    path: '/api/v1/pareto',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-pareto',
    sourceSha256: 'b93b93fcb8732977358dcead9ec6b26cc0e72f54000797ac558b1fd93e154e20',
  },
  {
    source: 'src/app/api/gpu-metrics/route.ts',
    path: '/api/gpu-metrics',
    method: 'GET',
    classification: 'ui-artifact-read',
    exclusionReason: {
      en: 'PowerX raw/series=power read used by the UI and, in-process, by the public GPU metrics view: one source per run (the DB when the run has stored telemetry, otherwise its GitHub artifacts, never combined), separate host/GPU identities and adjacent CSV context timezone normalization. runId must be a positive safe integer. Stored raw reads report run-wide coverage as complete, partial or unknown inventory; missingArtifacts names wholly missing artifacts. Raw native bundles expose optional Celsius temperature when no CSV sibling exists. GET has no expected identities and reports sourceCoverage unknown. Live windows are unique by validation source, preferring CSV over bundle. Stored series=power reads serve the per-artifact output ingest precomputed when it matches the current series and linked point audits, and otherwise bucket the stored samples; both give the same response. DB failures return 503 DATABASE_UNAVAILABLE; known-incomplete stored telemetry returns 503 STORED_TELEMETRY_INCOMPLETE without trying GitHub. Responses use no-store. This is not a stable public API.',
      zh: '供 PowerX 界面读取原始遥测或 series=power，公开 GPU 指标视图也在进程内调用：每个 run 只使用一个数据来源（遥测已入库时只读 DB，否则只读该 run 的 GitHub 产物，两者不混用），保留主机/GPU 身份，并按相邻 CSV context 规范化时区。runId 必须为正安全整数。数据库原始读取的 coverage 标明整个 run 的清单完整、部分缺失或未知，missingArtifacts 列出整体缺失的产物。没有对应 CSV 时，原生 bundle 的原始数据包含可用的 GPU 温度（摄氏度）。GET 没有预期身份清单，sourceCoverage 为 unknown。实时窗口按 validation source 去重，优先 CSV，再用 bundle。已入库 run 的 series=power 读取在入库预计算结果与当前序列及关联数据点的功耗审计一致时直接使用该结果，否则按已存样本现场分桶，两者响应相同。数据库故障返回 503 DATABASE_UNAVAILABLE；若已入库的遥测已知不完整，则返回 503 STORED_TELEMETRY_INCOMPLETE，不会转而读取 GitHub。响应使用 no-store，不作为稳定公开 API。',
    },
    sourceSha256: '615764302df4407415dc3de4dae8c6065f7726ba073d90074cfb0bd475243eb4',
  },
  {
    source: 'src/app/api/gpu-metrics/route.ts',
    path: '/api/gpu-metrics',
    method: 'POST',
    classification: 'ui-artifact-read',
    exclusionReason: {
      en: 'Read-only Timeline transport with runId, series=power and optional prefix in the query; JSON sources contains 1–1000 validation basenames with RESULT_FILENAME up to 200 ASCII letters/digits/dot/underscore/hyphen, matching prefix. Invalid input returns 400; bodies over 256 KiB return 413. A requested window missing from an ingested run is not fetched from GitHub; the DB response lists it in missingSources with sourceCoverage incomplete. Coverage describes only requested identities, never whole-run/sample completeness. The GET source-selection, no-store and error guarantees also apply. UI-owned, excluded from the stable public API.',
      zh: 'Timeline 只读传输：查询参数为 runId、series=power 和可选 prefix；JSON sources 含 1–1000 个验证文件 basename，RESULT_FILENAME 最长 200 个 ASCII 字母/数字/点/下划线/连字符，且须匹配 prefix。输入错误返回 400，正文超过 256 KiB 返回 413。已入库 run 缺少的请求窗口不会从 GitHub 补齐，DB 响应会将其列入 missingSources，并把 sourceCoverage 标记为 incomplete。覆盖仅针对请求身份，不代表整次 run 或样本完整性。沿用 GET 的单一来源选择、no-store 和错误约束；属于界面接口，不纳入稳定公开 API。',
    },
    sourceSha256: '615764302df4407415dc3de4dae8c6065f7726ba073d90074cfb0bd475243eb4',
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
    sourceSha256: 'c2ab5f583d679f7acb4c9d052480f6c017c134debb09d1303e420582e03b312a',
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
    sourceSha256: '74f786c85bf1289a2b4ca50e7ea240a71d775ee6dd62558461bbb0dec8ec2ca3',
  },
  {
    source: 'src/app/api/unofficial-run/route.ts',
    path: '/api/unofficial-run',
    method: 'GET',
    classification: 'ui-artifact-read',
    exclusionReason: {
      en: 'UI-only overlay for unofficial workflow artifacts. Append-only runs also include the published curve points they extend when each shared topology keeps its image. Development on loopback hosts may explicitly opt into local artifact files via INFERENCEX_LOCAL_ARTIFACT_DIR; production only reads the public GitHub source. Artifact availability and shape are not stable.',
      zh: '仅供界面叠加非官方工作流产物。append-only 运行还会包含其所扩展的已发布曲线数据点，前提是两者共有的每种拓扑都使用同一镜像。开发环境通过本机地址访问时，可用 INFERENCEX_LOCAL_ARTIFACT_DIR 显式启用本地文件；生产环境仅从公开 GitHub 来源读取。产物的可用性和结构并不稳定。',
    },
    sourceSha256: '735305384997ffb8cd82a4cca9a1fcd512f7ffe06ce9ac82776616da5e49fe5f',
  },
  {
    source: 'src/app/api/v1/agentic-aggregates/route.ts',
    path: '/api/v1/agentic-aggregates',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-agentic-aggregates',
    sourceSha256: 'be4cf028c987f7c0ca12bd58d4e7fbea87acfe336e0fe3c28342b16abc723f95',
  },
  {
    source: 'src/app/api/v1/availability/route.ts',
    path: '/api/v1/availability',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-availability',
    sourceSha256: '42e8ae62eb369f4b172611d19b339865e40e507d41c4eedcedcc44cf8c88bcaf',
  },
  {
    source: 'src/app/api/v1/benchmark-siblings/route.ts',
    path: '/api/v1/benchmark-siblings',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-benchmark-siblings',
    sourceSha256: '58dfea741e2d7d3700d3b058a2652fd60539d59529ae21229b4b75620035d5b6',
  },
  {
    source: 'src/app/api/v1/benchmarks/route.ts',
    path: '/api/v1/benchmarks',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-benchmarks',
    sourceSha256: 'c8fe822b1a3b42585b2f9984ad867b639d59fe46433a2d3de291942600a93412',
  },
  {
    source: 'src/app/api/v1/benchmarks/history/route.ts',
    path: '/api/v1/benchmarks/history',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-benchmark-history',
    sourceSha256: 'dcdda2fb8d266449de4f7a5e1b63dde13a628aa3ee52e44e7cc5a8ee5b28aa82',
  },
  {
    source: 'src/app/api/v1/collectivex/latest/route.ts',
    path: '/api/v1/collectivex/latest',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-collectivex-latest',
    sourceSha256: 'd1e5ea3e3c7a9c84dabbb7e70dc734ca1583e806f6588404a4c910fa560acf4a',
  },
  {
    source: 'src/app/api/v1/collectivex/runs/route.ts',
    path: '/api/v1/collectivex/runs',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-collectivex-runs',
    sourceSha256: '804ff15bad90eebd5cb7ec9b091a526bdedbf20f240e05ce295771a634eb18d3',
  },
  {
    source: 'src/app/api/v1/collectivex/runs/[runId]/route.ts',
    path: '/api/v1/collectivex/runs/{runId}',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-collectivex-run',
    sourceSha256: '2b9f66049330712f391fe0fd2d683bc65abb990385009ffbbf8d7cf5cc4ca17c',
  },
  {
    source: 'src/app/api/v1/datasets/route.ts',
    path: '/api/v1/datasets',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-datasets',
    sourceSha256: 'f6df271a585c1ac65505caed3f47423a6f16576e9c05ff5d53e507e4beb475d3',
  },
  {
    source: 'src/app/api/v1/datasets/[slug]/route.ts',
    path: '/api/v1/datasets/{slug}',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-dataset',
    sourceSha256: '513cd6ffbf459e98692e40abb5b4859b3dfccd312d22301b408e3ae469d40a6f',
  },
  {
    source: 'src/app/api/v1/datasets/[slug]/conversations/route.ts',
    path: '/api/v1/datasets/{slug}/conversations',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-dataset-conversations',
    sourceSha256: 'fb1d6f4659419882d08898d98f215802586bb405b7432e3537900b8ec9424ddf',
  },
  {
    source: 'src/app/api/v1/datasets/[slug]/conversations/[convId]/route.ts',
    path: '/api/v1/datasets/{slug}/conversations/{convId}',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-dataset-conversation',
    sourceSha256: '262500d49207a902db5616eda32e6e9f0dcea10a67d054c48bc7c70a79379118',
  },
  {
    source: 'src/app/api/v1/derived-agentic-metrics/route.ts',
    path: '/api/v1/derived-agentic-metrics',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-derived-agentic-metrics',
    sourceSha256: '368cbe37cee8dd509ff046628091cc95cfb3ea9f80855e74b6cf856a3b340523',
  },
  {
    source: 'src/app/api/v1/eval-samples-live/route.ts',
    path: '/api/v1/eval-samples-live',
    method: 'GET',
    classification: 'ui-artifact-read',
    exclusionReason: {
      en: 'UI-only evaluation sample reader backed by live workflow artifacts with an unstable artifact contract.',
      zh: '仅供界面读取由实时工作流产物支持的评测样本；该产物契约不稳定。',
    },
    sourceSha256: '64d3881d026ca257336208dc3c515438d507aebcf681c4cc8860f5fb1d6b3f44',
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
    sourceSha256: '00a2fcaeb71bdfe27af1f6cd7a92122f2d7828c88f677b3e7fb3e8235b8e05c7',
  },
  {
    source: 'src/app/api/v1/evaluations/route.ts',
    path: '/api/v1/evaluations',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-evaluations',
    sourceSha256: '5ccc3351d87ed9b3515314692ea506150d787935d2b86f47aa8b81dcb9eabc1d',
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
    sourceSha256: '4bb4351da6a074b034baaaf42d7d4c5f9ba1a648ca0622468ce3ddbb575b129d',
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
    sourceSha256: '5b585e7dabfa6000f5613bcdbdd55b62f164eddeefd4744f898b54d448f168cb',
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
    sourceSha256: 'fcc7185f1c837a2d204e0d0114ba12da8baa40aed3e478b7f8aaf6d0409081aa',
  },
  {
    source: 'src/app/api/v1/latest-images/route.ts',
    path: '/api/v1/latest-images',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-latest-images',
    sourceSha256: 'd856b33932b440c24b78094dc6a71be070ff7ef0876d8115263514ccab6aa35f',
  },
  {
    source: 'src/app/api/v1/log-availability/route.ts',
    path: '/api/v1/log-availability',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-log-availability',
    sourceSha256: '9137745fa6826a14ec63e6b483666688949b4cef9140e64ff2eae8fd7b4164ef',
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
    sourceSha256: '26b300395f5f1c64c74f92f5f3058cb3d3550927a93d2bc769a729e7922f0404',
  },
  {
    source: 'src/app/api/v1/reliability/route.ts',
    path: '/api/v1/reliability',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-reliability',
    sourceSha256: 'de9a9c65f3300a1353367e501d0be853c448de49d0321d3495a46a869a03350f',
  },
  {
    source: 'src/app/api/v1/gpu-metrics-point/route.ts',
    path: '/api/v1/gpu-metrics-point',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Point-detail BFF accepting a positive safe-integer id and returning linked PowerX telemetry series, per-GPU statistics computed from their stored samples and retained validation/audit metadata. Every read checks a live DB revision before using the Blob payload cache; responses use no-store, missing data returns 404, and database failures remain errors. Re-ingest, shared-link and statistics algorithm version changes do not require manual cache purges. The CI publication verifier reads it after each telemetry ingest. Coupled to the PowerX tab implementation.',
      zh: '数据点详情 BFF；id 必须为正安全整数，返回关联的 PowerX 遥测序列、由已存样本计算的每 GPU 统计，以及保留的验证与审计元数据。每次读取先核对数据库版本再使用 Blob 缓存；响应使用 no-store，数据缺失返回 404，数据库故障仍作为错误返回。重新入库、共享链接及统计算法版本变化无需手动清理缓存。CI 发布校验会在每次遥测入库后读取此接口。与 PowerX 标签页实现紧密耦合。',
    },
    sourceSha256: 'de607d7ae70093d9575fe63158946574d2cd2bfbbd058b504602377995cd0a57',
  },
  {
    source: 'src/app/api/v1/gpu-metrics-point/stats/route.ts',
    path: '/api/v1/gpu-metrics-point/stats',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-gpu-metrics-point-stats',
    sourceSha256: 'c57da2254b272d4d5de7d174b5cbf15317caace52038566c8fc73a3507f37b86',
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
    sourceSha256: 'f96ebd3ebf149bc6d800c363a493aa84da905807cbf963ced90467161a58434d',
  },
  {
    source: 'src/app/api/v1/request-timeline/route.ts',
    path: '/api/v1/request-timeline',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-request-timeline',
    sourceSha256: '9f0ae9edc79d4658ee9f8c8b4e05667468f977786105b80df852ad4744249b97',
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
    sourceSha256: '0abb57dbdbda91c5df34bd3bf51b9b46a7be33eeb7cbba625a3a0ec300f52be8',
  },
  {
    source: 'src/app/api/v1/server-log-files/route.ts',
    path: '/api/v1/server-log-files',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-server-log-files',
    sourceSha256: '52d57c3f09f17b7eef652476e92d1ab193b772acc5aeeddca370a8f970efb2af',
  },
  {
    source: 'src/app/api/v1/server-log-search/route.ts',
    path: '/api/v1/server-log-search',
    method: 'GET',
    classification: 'published-read',
    operationId: 'search-server-logs',
    sourceSha256: '183ed41ec785a32c3bda5b3bbed250b8605bd52190048246ff456d272ebfca12',
  },
  {
    source: 'src/app/api/v1/server-log/route.ts',
    path: '/api/v1/server-log',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-server-log',
    sourceSha256: '3d9e480b37e7f69c14902832605e6a3a51d651b403990885ff11955756c81c85',
  },
  {
    source: 'src/app/api/v1/submissions/route.ts',
    path: '/api/v1/submissions',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-submissions',
    sourceSha256: 'e926912cbc10b87a1c33a1666c0709c521d88bd3f709a4cf33bba3bbc8deb5dc',
  },
  {
    source: 'src/app/api/v1/tco-feed/route.ts',
    path: '/api/v1/tco-feed',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-tco-feed',
    sourceSha256: '41f47e4761df1cd80e7a4656f8f2cac70651995923e9ec4e52bfda562e251f78',
  },
  {
    source: 'src/app/api/v1/trace-availability/route.ts',
    path: '/api/v1/trace-availability',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-trace-availability',
    sourceSha256: '340263c1a6b56c5bd9df5205dbc401d1d68905714855cac6b1c5f0eaa14fe629',
  },
  {
    source: 'src/app/api/v1/trace-histograms/route.ts',
    path: '/api/v1/trace-histograms',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-trace-histograms',
    sourceSha256: '8fe52f2c2cef13a89f8d1d5ce70be89d0353da3f059afaabe1a392ee369af13d',
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
    sourceSha256: 'd6e669b492fcb509b592ab5c68d5ac71d253b5420e97a828fefc778bd47c3651',
  },
  {
    source: 'src/app/api/v1/trace-server-metrics/route.ts',
    path: '/api/v1/trace-server-metrics',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-trace-server-metrics',
    sourceSha256: '858f01573385ef389d1d5177dd69ec1438347a98c6b6d0670ef0eff30fe052e6',
  },
  {
    source: 'src/app/api/v1/workflow-info/route.ts',
    path: '/api/v1/workflow-info',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-workflow-info',
    sourceSha256: '699ce4cbfb5e8aba29f2ed67d9133dc07d6071dce4ed6bba2691a295cbb4227c',
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
    source: 'src/components/ubenchx/ubenchx-transform.ts',
    sourceSha256: '9458ad2b969525fe68da5a3b54ac151384610d0bd2ba84585a9043b3a67bf949',
    reviewArea: {
      en: 'ubenchX Huawei measurement units, protocol metadata and shared UI/API calculations.',
      zh: 'ubenchX Huawei 测量单位、协议元数据及界面与 API 共用的计算。',
    },
  },
  {
    source: 'src/components/ubenchx/ubenchx-data.ts',
    sourceSha256: '3f1e3e1f4c85170636fcfa6e62f1f4ed5d2bd947459ba4f4fa4fada6bd75232b',
    reviewArea: {
      en: 'ubenchX Huawei measurement units, protocol metadata and shared UI/API calculations.',
      zh: 'ubenchX Huawei 测量单位、协议元数据及界面与 API 共用的计算。',
    },
  },

  {
    source: 'src/components/ubenchx/huawei-sku-configurations.ts',
    sourceSha256: 'b1ef962920ae1127aba42421eb47411df26935bc600de2723a09754d482f0c85',
    reviewArea: {
      en: 'Huawei SKU configuration transcription, source provenance and UI/API filtering.',
      zh: 'Huawei SKU 配置转录、来源信息及界面与 API 筛选。',
    },
  },

  {
    source: 'src/components/ubenchx/core-memory-profiles.ts',
    sourceSha256: '96c51ab39b475653dac1e9c5d5dd42eb23c595b4e5e7f485d59a72a44afd99a4',
    reviewArea: {
      en: 'ubenchX Huawei measurement units, protocol metadata and shared UI/API calculations.',
      zh: 'ubenchX Huawei 测量单位、协议元数据及界面与 API 共用的计算。',
    },
  },

  {
    source: 'src/lib/catalog/gpu-specs.ts',
    sourceSha256: 'fb9dc719f347fb5b73ea73cf35a19d12c640b34a284f31cd70a8b9b2df76b4fd',
    reviewArea: {
      en: 'GPU specifications shared by chip pages, GPU charts and the public GPU specs view; review NIC rates, unknown topology, ranking values and units.',
      zh: '芯片页、GPU 图表及公开 GPU 规格视图共用的数据；审核网卡速率、未指定的拓扑、排名数值及单位。',
    },
  },
  {
    source: 'src/lib/catalog/model-architectures.ts',
    sourceSha256: 'b70020f3ca528f3ef01f3e55421801fdf059fd08033c9cf79eac79831b8bfebb',
    reviewArea: {
      en: 'Model architecture facts shared by model pages, diagrams and the public architecture catalog; preserve exact dimensions, parameter accounting, source URLs and optional fields.',
      zh: '模型页、架构图和公开架构目录共用的规格；保留精确维度、参数量口径、来源链接及可选字段。',
    },
  },
  {
    source: '../db/src/operatorx/visualization.ts',
    sourceSha256: '254d065ad3363fe986310bedd5b7db2802df08f2f769e2a6a850da38b6025c41',
    reviewArea: {
      en: 'OperatorX workload-resolved chart defaults and shared shape grouping used by UI and comparison API.',
      zh: 'OperatorX 按工作负载确定的图表默认值及形状分组，由 UI 与对比 API 共用。',
    },
  },
  {
    source: '../db/src/operatorx/compare.ts',
    sourceSha256: '1f0631a7d4a62fbaf7132f604ead59a6e4c524c1f05cdf5762308f8e2bed12f8',
    reviewArea: {
      en: 'OperatorX page-owned comparison: workload filtering and optional hardware normalization references; excluded from published OpenAPI.',
      zh: 'OperatorX 页面专属对比：workload 筛选及可选的硬件归一化参考值；不纳入公开 OpenAPI。',
    },
  },
  {
    source: 'src/lib/operatorx/roofline-summary.ts',
    sourceSha256: '47d966e7aa7934cea6daefed5e8a37f6cdd888f0ee8a1e428cad990624380b69',
    reviewArea: {
      en: 'OperatorX per-hardware and shared compute-bound cohorts, median/best throughput, precision and normalized values shared by the roofline bars and API.',
      zh: 'OperatorX 的各硬件自身及共同计算受限用例、吞吐量中位数与最佳值、精度及归一化数值，由 roofline 柱状图与 API 共用。',
    },
  },
  {
    source: 'src/lib/operatorx/distribution-view.ts',
    sourceSha256: 'de9f2203e99753f955922170aead6906fd6df7c389e96baf249ab6b0d8dda8aa',
    reviewArea: {
      en: 'OperatorX distribution metric, normalization, matching, hardware filters, and quantiles shared by UI and page-owned API.',
      zh: 'OperatorX 分布图的指标、归一化、匹配用例、硬件筛选和分位数，由 UI 与页面专属 API 共用。',
    },
  },
  {
    source: 'src/lib/operatorx/service.ts',
    sourceSha256: 'f14a3caf1bb3bd3f23d8fe4b9f71ae58a1842c26da3fd545ec67572e33d9808f',
    reviewArea: {
      en: 'OperatorX bulk compact reads, revision-keyed shared Blob comparisons, raw fallback, partial/revision cache exclusion and bounded timeline reads.',
      zh: 'OperatorX 批量精简读取、按 revision 共享 Blob 对比缓存、原始数据回退、部分失败或 revision 变更时不缓存，以及时间线限流并行读取规则。',
    },
  },
  {
    source: '../db/src/operatorx/comparison-cache.ts',
    sourceSha256: '82db8cd90b176c6f86328f64504f9417cd748788319dec43532d84d33a9b81f5',
    reviewArea: {
      en: 'Versioned ingest-time OperatorX projections and newest-first merge preserving statuses, source ordering and timeline provenance.',
      zh: 'OperatorX 写入时生成的版本化对比数据及最新优先合并规则，保留状态、来源顺序和时间线归属。',
    },
  },
  {
    source: '../db/src/queries/operatorx.ts',
    sourceSha256: '134980fa91bf9ffb21659527f3834f10971afd2cc3b7d738673bb93dcb0b6c0e',
    reviewArea: {
      en: 'OperatorX raw and compact reads, atomic projection writes and revision-guarded backfill.',
      zh: 'OperatorX 原始及精简数据读取、事务内写入和按 revision 校验的 backfill。',
    },
  },
  {
    source: '../db/src/operatorx/hardware.ts',
    sourceSha256: 'aefd67d99d91f23ef812ea09501603a7e6cc8b228d21d8cf2aa006f405f8c4ff',
    reviewArea: {
      en: 'OperatorX Ascend reference values, provenance and assumed bandwidth shared with UI normalization.',
      zh: 'OperatorX Ascend 参考值、来源及假定带宽，与 UI 归一化共用。',
    },
  },

  {
    source: 'src/app/api/gpu-metrics/artifact-selection.ts',
    sourceSha256: 'e92ccb4d5f3706ae063b23652cb9898616820c16589745057eac43dceb96771c',
    reviewArea: {
      en: 'Live telemetry artifact prefix and requested-source selection; queries/gpu-metrics.ts hand-copies the rules in SQL for stored reads.',
      zh: '实时遥测的产物前缀及请求 source 选择规则；queries/gpu-metrics.ts 在 SQL 中为数据库读取手工复刻同一规则。',
    },
  },
  {
    source: '../db/src/queries/gpu-metrics-coverage.ts',
    sourceSha256: '7582534ab355487c6a88bd80e0dcb389595aa27f1bc58b73a566fc6a26ef5593',
    reviewArea: {
      en: 'Run-wide stored telemetry coverage: complete, partial or unknown inventory and entirely missing artifact names.',
      zh: '已存遥测在整个 run 的覆盖范围：清单完整、部分缺失或未知，以及整体缺失的产物名称。',
    },
  },
  {
    source: '../db/src/queries/gpu-metrics.ts',
    sourceSha256: '8d1723849552e1c28c41d2c9dc07f03d605398e64bce5cc1df5942901296f4aa',
    reviewArea: {
      en: 'Stored PowerX telemetry reads: latest attempt, prefix and requested-source scoping, GPU metrics view artifact selection, point lookups, run inventory coverage, missing metric readings and per-GPU statistics computed from complete stored samples.',
      zh: '数据库 PowerX 遥测读取：最新 attempt、前缀与请求 source 范围、GPU 指标视图的产物选择、单点查询、run 清单覆盖范围、缺失指标读数，以及基于完整已存样本计算的每 GPU 统计。',
    },
  },
  {
    source: '../db/src/queries/gpu-power-series.ts',
    sourceSha256: '9054bc94179937e9c2cf3c9f0692f5a7ddfb053237a118dbf22d8e6fff5442dc',
    reviewArea: {
      en: 'Precomputed PowerX timeline series: per-artifact rows keyed by series identity, linked point audits and transform version; any mismatch or incomplete artifact falls back to the stored samples.',
      zh: '预计算 PowerX 时间线序列：按产物存储，键值包含序列身份、关联数据点的功耗审计和转换版本；任一不匹配或产物不完整时回退到已存样本。',
    },
  },
  {
    source: '../db/src/power-series/power-audit-cut.ts',
    sourceSha256: '45517588063eb65ad9dd04e14132a1e9b6aed7646f5bb533a0c848802718a27c',
    reviewArea: {
      en: 'Timeline validation-window cuts shared by live artifacts and precomputed series: window padding, strict nested AgentX result identity and device identity semantics.',
      zh: '实时产物与预计算序列共用的 Timeline 验证窗口截取：窗口留白、严格匹配的嵌套 AgentX result 身份及设备身份语义。',
    },
  },
  {
    source: 'src/app/api/gpu-metrics/github-telemetry.ts',
    sourceSha256: 'dbb77691d07bf8fca2b2edceea63ec62cbfc329ae07542a557a2e3bd754bcfc5',
    reviewArea: {
      en: 'Live PowerX artifact selection with ingest-matching CSV precedence for equal suffixes, download bounds, per-artifact failure isolation, CSV context normalization and bundle decoding.',
      zh: 'PowerX 实时产物选择沿用 ingest 的同后缀 CSV 优先规则、下载限制、单产物故障隔离、CSV context 规范化及 bundle 解码。',
    },
  },
  {
    source: 'src/components/calculator/profit-power.ts',
    sourceSha256: 'e2b76e9625af7f2aba4968c41525f9939727477dce81215a57974a100998cd23',
    reviewArea: {
      en: 'Power-valid curve selection at fixed targets, compatible power bases, paired throughput and provisioned fallback shared by Profit UI and API.',
      zh: '利润界面与 API 共用的有效功耗曲线选择、固定目标值、功耗口径兼容性、配对吞吐量与预配估算回退。',
    },
  },
  {
    source: 'src/components/inference/utils/inference-table-data.ts',
    sourceSha256: 'dd455a89004609d10f1b5cd12a04132db612701ae6e493c3db66c91ab8ce40d8',
    reviewArea: {
      en: 'All in Measured and IT (no PUE) table eligibility, nullable values and unavailable reasons shared by UI, CSV and public views.',
      zh: '界面、CSV 和公开视图共用的整体实测与 IT（不含 PUE）表格行筛选、可空数值与不可用原因。',
    },
  },
  {
    source: 'src/components/inference/utils/resolveXAxisField.ts',
    sourceSha256: '6ab8cf1353312d0f6ba3dae0aa2f5e0665b40a0b916322c23c57d976c5167839',
    reviewArea: {
      en: 'Shared service-axis resolution: fixed-sequence mean/median, reciprocal mean TPOT, and AgentX percentile isolation.',
      zh: '共用服务轴解析：固定长度工作负载 mean/median、mean TPOT 的倒数，以及 AgentX 独立的分位数选择。',
    },
  },
  {
    source: 'src/components/inference/utils/equal-service-comparison.ts',
    sourceSha256: '5d044897542c1067bff7fc3fed59669e813b6ab6b9eaf1a7ebe2f89db6645256',
    reviewArea: {
      en: 'Source-scoped equal-service interpolation, comparator-relative changes, endpoint provenance, prefill share projection and role points.',
      zh: '按完整来源限定的同等服务插值、相对基准变化、端点来源、prefill 占比视图以及各角色数据点。',
    },
  },
  {
    source: 'src/components/inference/utils/matched-concurrency.ts',
    sourceSha256: 'db81deeff9e6ff64f607b71751d18acc59626f43fecbe037145e3a55c4fe959f',
    reviewArea: {
      en: 'Same-concurrency pairing of two exact sources: missing and conflicting observations, signed comparator-relative changes, no interpolation.',
      zh: '两个完整来源在相同并发下的配对：缺失与冲突观测、相对基准的带符号变化，不做插值。',
    },
  },
  {
    source: 'src/components/inference/utils/power-fit.ts',
    sourceSha256: '4e2e566d2ccfe495af23d40b83b56d7ec329792f472e6391250eb04aa269bf60',
    reviewArea: {
      en: 'Per-source least-squares power fit on output per allocated GPU: intercept, marginal J/token, R², fitted range and registry TDP.',
      zh: '按来源对每个已分配 GPU 的输出做最小二乘功耗拟合：截距、边际 J/token、R²、拟合范围与注册表 TDP。',
    },
  },
  {
    source: 'src/components/inference/utils/power-breakdown.ts',
    sourceSha256: 'dc11d8c04a614a9313e390b5eb0911beb1dc94473984eaa6f9a62b9542af1d09',
    reviewArea: {
      en: 'Per-point system power breakdown: measured GPU and Grace parts, then the modeled CPU, memory, NIC, NVSwitch, storage, PCIe/misc, fan, PSU-loss, scale-out network and PUE overhead parts, summing to All in Measured W/GPU; the IT (no PUE) boundary is the same stack without the facility part.',
      zh: '逐点系统功耗构成：实测 GPU 与 Grace 部分，以及建模的 CPU、内存、网卡、NVSwitch、存储、PCIe 及其他、风扇、电源损耗、横向扩展网络与 PUE 开销部分，合计等于 All in Measured W/GPU；IT（不含 PUE）边界即去掉数据中心开销后的同一堆叠。',
    },
  },
  {
    source: 'src/components/inference/utils/role-energy.ts',
    sourceSha256: '48e9aff8084dc53b41028a7e7e293643f972c1d45f351c0604ff43c4578493f0',
    reviewArea: {
      en: 'Validated prefill/decode energy reconstruction and shares on a common output-token denominator.',
      zh: '使用统一 output token 分母的已验证 prefill/decode 能耗重建与占比。',
    },
  },
  {
    source: 'src/lib/benchmarks/benchmark-transform.ts',
    sourceSha256: '4a59ccf2b1190d8165e45a54aee212814282f39f3271041221abe9ff7be7a68f',
    reviewArea: {
      en: 'Raw benchmark means and derived reciprocal mean-TPOT interactivity used by Dashboard and read-only views.',
      zh: '仪表板和只读视图共用的原始 benchmark 均值与 mean TPOT 倒数形式的 interactivity。',
    },
  },
  {
    source: '../db/src/etl/power-audit-validations.ts',
    sourceSha256: '6c8c95124932a3ea9500c1e57c5ad018885376b736ce037194f900b440dde636',
    reviewArea: {
      en: 'Shared legacy and nested AgentX validation identity normalization for artifact and stored Timeline windows.',
      zh: '产物与数据库 Timeline 窗口共用的 legacy 和嵌套 AgentX validation 身份规范化。',
    },
  },
  {
    source: 'src/components/gpu-power/power-audit-bundle.ts',
    sourceSha256: '56bfe14a8e854726f93e19a07cee1bc59b3582300d5a5c8afd2885310a779a52',
    reviewArea: {
      en: 'Artifact Timeline validation windows, strict nested AgentX result identity, adjacent context selection, timezone normalization and device identity semantics.',
      zh: '产物 Timeline 验证窗口、严格匹配的嵌套 AgentX result 身份、相邻 context 选择、时区规范化及设备身份语义。',
    },
  },
  {
    source: 'src/components/gpu-power/stored-gpu-stats.ts',
    sourceSha256: '77e9f6ad6eef5f3c30899a9a24d04b0d85b64b0293bea9c38964a9680a55e289',
    reviewArea: {
      en: 'Full-record GPU metric mappings for stored statistics, metrics without readings, and stored/live statistics parity.',
      zh: '数据库统计的全记录 GPU 指标映射、无读数指标的处理，以及数据库统计与实时产物统计的一致性。',
    },
  },
  {
    source: 'src/components/gpu-power/types.ts',
    sourceSha256: '7c5bd549fa5c55ca906d08ecd6521ad5b06f1c95599d4f32d84c3fbfb7e3c0c1',
    reviewArea: {
      en: 'GPU telemetry units, missing values, timestamp deduplication, and full-record live statistics definitions.',
      zh: 'GPU 遥测单位、缺失值、时间戳去重，以及实时产物全记录统计的定义。',
    },
  },
  {
    source: 'src/components/calculator/profit-estimator.ts',
    sourceSha256: '0eeaaed822068e9aa782e6b40ad1bb9ae31f70ef755f67622767f3b89ade4d1a',
    reviewArea: {
      en: 'Shared profit-estimator defaults and calculation parity, including model-specific target assumptions.',
      zh: '利润估算器的共享默认值与计算一致性，包括各模型的目标假设。',
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
    source: 'src/components/gpu-power/chart-data.ts',
    sourceSha256: '438cb43b5a57169275a3ea1012fa5a25ed8d3195432790d1ecf6774c3cfa12cd',
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
    sourceSha256: 'a885ffc19a600c94d640116b04c53c62b03a8b186c59da8b07fcb34939c00cc8',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/inference/hooks/interpolated-trend-core.ts',
    sourceSha256: '231c59a712838f58eabce02767abcdfbc48defcd5e6bc1ad9c8c939ee308cf95',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/inference/hooks/chart-data-core.ts',
    sourceSha256: 'e2b95516a6ebb16c312c711b540cc7ffff52ab184238bb5b2f40b6155b69d126',
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
    sourceSha256: '9dbf3e828140b50023724ce129e25db90ce358ceed1e4051871d43a62ec267ef',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/errors.ts',
    sourceSha256: '6253b908c4956286a657c9b42d590a0ad0eaedf4fa92b00acad2939135d66add',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/calculator-extensions.ts',
    sourceSha256: 'e2e3ecf4e5f5e0561d81c3eceee1b5d497011e3cd9a1182328cce6ec721ca7f9',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/source.ts',
    sourceSha256: '4d2a0b9d81ea157923b2ca38a94133d037316f5b4623e52a322ecf0222eedc95',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/inference/utils/model-defaults.ts',
    sourceSha256: '675182832cfef28385ee3853ce022dbe341aecadef5215f54478c0063e5aa4df',
    reviewArea: {
      en: 'Inference model-specific axis and hardware defaults.',
      zh: '推理视图的模型特定坐标轴和硬件默认值。',
    },
  },

  {
    source: 'src/lib/views-api/series.ts',
    sourceSha256: '56d51db6c3d6b49417692ad822076d57935439ea21a907e19f72cb48a9cb6c80',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/registry.ts',
    sourceSha256: 'd6cf9fe4b5ade6706ea4e32331b3148c17734a945dc95a8e6e6e738f7885ab7f',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/params.ts',
    sourceSha256: '00dd4d4b6bd360e4ce7ea26027bd60a01693901f380ed772e212897dc6202a64',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/api/pareto-api.ts',
    sourceSha256: 'e42ab184f78ce81e322822a043a7e40d18bb97fb3da2c10b0bfb2528a26c9fca',
    reviewArea: {
      en: 'Pareto selectors, validation, source scope, missing-axis counts and boundary observations.',
      zh: 'Pareto 选择条件、验证、来源范围、缺失坐标计数和边界观测值。',
    },
  },
  {
    source: 'src/lib/charts/pareto-frontier.ts',
    sourceSha256: '03a09b631f9dd933d21189e684ea729259e9a228274d55b1da65d2af102a9a4a',
    reviewArea: {
      en: 'Shared chart/API dominance directions, tie handling and boundary ordering.',
      zh: '图表与 API 共用的支配方向、同坐标处理和边界排序。',
    },
  },
  {
    source: 'src/lib/cache/api-cache.ts',
    sourceSha256: 'f70cdf1994432842d0249c3d601b95c6c292b86bf7f811253f77c5b09a404e28',
    reviewArea: {
      en: 'Public CDN tags, cache lifetimes, Blob key dimensions, and purge behavior.',
      zh: '公开 CDN 标签、缓存时长、Blob 键维度和清除行为。',
    },
  },
  {
    source: 'src/lib/cache/blob-cache.ts',
    sourceSha256: 'c1d051cb35e353877f75ad772a76de861d198d16d3b59c18b60c2af48230c39b',
    reviewArea: {
      en: 'Blob cache read, write, prefix migration, and purge behavior.',
      zh: 'Blob 缓存读取、写入、前缀迁移和清除行为。',
    },
  },
  {
    source: 'src/lib/api/cached-read-route.ts',
    sourceSha256: 'd403f7cca0930dd32f0563f78caa19cd4250c3f298e5bcb4d60185868b663404',
    reviewArea: {
      en: 'Shared parameterless cached-read fixture, response, and public-error behavior.',
      zh: '共享无参数缓存读取的夹具、响应和公开错误行为。',
    },
  },
  {
    source: 'src/lib/api/bearer-auth.ts',
    sourceSha256: 'f9bb8619b6b9c3017fa780a8956aa7584fdd54d89f86f8335c295077cab71f4d',
    reviewArea: {
      en: 'Byte-safe constant-time Bearer credential comparison used by administration routes.',
      zh: '管理路由使用的字节安全恒定时间 Bearer 凭据比较。',
    },
  },
  {
    source: 'src/lib/api/public-api-errors.ts',
    sourceSha256: '48301bb3567870921f5cae0e0a35240c9a687767b89f96141b36be41afbaa16a',
    reviewArea: {
      en: 'Canonical public JSON error strings shared by handlers and OpenAPI examples.',
      zh: '处理程序与 OpenAPI 示例共享的规范公开 JSON 错误字符串。',
    },
  },
  {
    source: 'src/lib/evaluation/eval-sample-params.ts',
    sourceSha256: '60073c6a3dcd7b4e16d2024606a2c7f457c35d127d89afaf361d382e198e88b9',
    reviewArea: {
      en: 'Shared stored/live evaluation sample filter and pagination behavior.',
      zh: '存储与实时评测样本共享的筛选和分页行为。',
    },
  },
  {
    source: 'src/lib/submissions/submissions-types.ts',
    sourceSha256: '1665a6a65f061184458997069b3222c9243b993f12573d83b0d10e571046a4bc',
    reviewArea: {
      en: 'Submission response topology and canonical database row type exports.',
      zh: '提交响应拓扑和规范数据库行类型导出。',
    },
  },
  {
    source: 'src/lib/benchmarks/benchmark-id.ts',
    sourceSha256: '36f9adf8a92cf5830abc01d0a389aa21eca9f429f31a9231b5d77e108c985d35',
    reviewArea: {
      en: 'Client-side persisted benchmark identifier recognition.',
      zh: '客户端持久化基准标识符识别。',
    },
  },
  {
    source: 'src/app/api/v1/id-routes.ts',
    sourceSha256: '4e4ba48759ce29206d6dc95f461526bd2e6856a3a9ea681c49a1a4f3365d40e7',
    reviewArea: {
      en: 'Shared positive safe-integer single-ID and ID-list validation, status codes, and error payloads for diagnostic reads.',
      zh: '诊断读取共享的正安全整数单 ID 与 ID 列表校验、状态码和错误载荷。',
    },
  },
  {
    source: 'src/lib/api/api.ts',
    sourceSha256: '8fd6eac0b6c3d0df45f9475083eb0c28a07775ca11dac4127ab3abe2f98998e1',
    reviewArea: {
      en: 'Public API client parameter serialization and TypeScript response contracts.',
      zh: '公开 API 客户端的参数序列化和 TypeScript 响应契约。',
    },
  },
  {
    source: 'src/lib/overview/overview-data.ts',
    // Reviewed for the DeepSeek-V4.1-Flash addition (InferenceX#2961): the
    // model joins OVERVIEW_MODEL_SCENARIOS as AgentX-only. Curated scenario
    // data, no parameter or OverviewPageData shape change, so the docs stand.
    // Muse uses the existing AgentX scenario and response shape.
    // Reviewed for the MiniMax-M3.1-Flash addition (InferenceX#4426): the model
    // joins OVERVIEW_MODEL_SCENARIOS as AgentX-only. No parameter or response
    // shape change, so the docs stand.
    sourceSha256: 'b722464d1738566c5b71eb44975539028eca4d0a68342362dceff041c5b43a97',
    reviewArea: {
      en: 'Overview BFF tier, engine, comparison-window, reference, and model-scope parameters plus the OverviewPageData response shape.',
      zh: '概览 BFF 的档位、引擎、对比时间窗口、参考硬件和模型范围参数，以及 OverviewPageData 响应结构。',
    },
  },
  {
    source: 'src/lib/calculator/tco-feed.ts',
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
    // Muse-Spark-Open / musespark added; API docs and AgentX cookbook updated.
    // Reviewed for the MiniMax-M3.1-Flash addition (InferenceX#4426): one new DB
    // key, `minimaxm31flash`, with its own display name and release date. The
    // AgentX cookbook documents the model; no endpoint or parameter shape changes.
    sourceSha256: '9afbd7db9690502ea53977496f228c89dc184c41e4a81a13a248bbf6fd38afb9',
    reviewArea: {
      en: 'Published benchmark and TCO model names, aliases, and parameter enums.',
      zh: '已发布基准与 TCO 模型名称、别名和参数枚举。',
    },
  },
  {
    source: '../db/src/collectivex/types.ts',
    sourceSha256: 'd4e7050c294cc3d22e14ee49fe419c761e50ca1f4bbaaf28cf2377d156a69bd4',
    reviewArea: {
      en: 'CollectiveX version negotiation and versioned dataset/run response types.',
      zh: 'CollectiveX 版本协商以及带版本的数据集与运行响应类型。',
    },
  },
  {
    source: '../db/src/etl/compute-request-timeline.ts',
    // Reviewed for gzip request-timeline storage (migration 017): only the
    // module comment changed to name request_timeline_gz. Same version,
    // record fields and timing semantics, so the docs stand.
    sourceSha256: '01a1cb2448ae599cc5802af9a014468982d70a8d7be53ff57d2fc37eaacc49b7',
    reviewArea: {
      en: 'Request timeline contract version, replay identity, source provenance, and event timing semantics.',
      zh: '请求时间线契约版本、重放标识、来源溯源和事件计时语义。',
    },
  },
  {
    source: '../db/src/queries/agentic-aggregates.ts',
    sourceSha256: '390d9ed94bf8f1712612a979ec29316f5a98b8faee34c71b77142e960103eeb2',
    reviewArea: {
      en: 'Agentic aggregate percentile keys, nullability, and ID-keyed response shape.',
      zh: '智能体汇总百分位字段、可空性和按 ID 索引的响应结构。',
    },
  },
  {
    source: '../db/src/queries/benchmark-siblings.ts',
    sourceSha256: 'b17ad7a59249ac9ff6e5d80125f6dcbbedbe976fa937ab6d622919c65b7f351d',
    reviewArea: {
      en: 'Benchmark sibling SKU metadata and sibling navigation row shape.',
      zh: '基准同组 SKU 元数据和同组导航行结构。',
    },
  },
  {
    source: '../db/src/queries/benchmarks.ts',
    sourceSha256: '8e9a09b505a8d01ca0660116d87692ac3c8ad57a5bf80bbde7fb041bf90acf22',
    reviewArea: {
      en: 'Benchmark row fields and latest, exact-run, history, and TCO query semantics.',
      zh: '基准行字段以及最新、精确运行、历史和 TCO 查询语义。',
    },
  },
  {
    source: '../db/src/queries/collectivex.ts',
    sourceSha256: 'c268a38a78ac9f11b8cf65bf14a7a69eba9b94b5cfa2f94f47cc34475a60b5c1',
    reviewArea: {
      en: 'CollectiveX dataset projection, run summaries, coverage, series, and latest-run ordering.',
      zh: 'CollectiveX 数据集投影、运行汇总、覆盖范围、序列和最新运行排序。',
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
    sourceSha256: '8ae98eaa877d09b724837d6936aa324fce9c203d71b6e0fd94d4971b5b24d628',
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
    // Reviewed for gzip request-timeline storage (migration 017): the reader
    // prefers request_timeline_gz and falls back to legacy JSONB, and logs a
    // stored timeline it cannot read. It returns the same RequestTimeline
    // document; current stored gzip can also stream directly with unchanged
    // CDN headers, bypassing the parsed-object Blob cache to bound memory.
    sourceSha256: '3dc8d83421ac5b468aad7914f19fe8c9f081713dad86222ec395d01df28b3cb2',
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
    sourceSha256: '9a4363a57ae319cadae4780b2ac584798b16580755aae0a61f9b7a686848ceec',
    reviewArea: {
      en: 'Trace availability ID-keyed boolean response shape.',
      zh: '跟踪可用性按 ID 索引的布尔响应结构。',
    },
  },
  {
    source: '../db/src/queries/trace-histograms.ts',
    // Reviewed for gzip request-timeline storage (migration 017): gzip rows
    // stream the same ISL/OSL arrays in Node. Unreadable points are now logged
    // and, as before, omitted. The ID-keyed response shape is unchanged, so
    // the docs stand.
    sourceSha256: 'a2f774da33065ca89703e41bf7d59f288281f0ad319e662319cbbb7d402d86b3',
    reviewArea: {
      en: 'Trace histogram input/output token arrays and ID-keyed response shape.',
      zh: '跟踪直方图输入/输出 token 数组和按 ID 索引的响应结构。',
    },
  },
  {
    source: '../db/src/queries/trace-server-metrics.ts',
    sourceSha256: '5e5409267997e2ca5df90e6ffa74042090a332ac5bd29e3a52055b8674725bdb',
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
