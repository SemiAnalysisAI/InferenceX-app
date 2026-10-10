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
    sourceSha256: 'fa289761d8a5f49a925e888b36bcf885dbcd4be188684752bf841e8418a73673',
  },
  {
    source: 'src/app/api/v1/views/collectivex/route.ts',
    path: '/api/v1/views/collectivex',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-collectivex-view',
    sourceSha256: 'c6c7e73d7f2c575cc52ad8c1b6989ab4ff0d240ec77cbed921e8389043d4abbb',
  },
  {
    source: 'src/app/api/v1/views/compare/route.ts',
    path: '/api/v1/views/compare',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-compare-view',
    sourceSha256: 'be24de22add5fad1f89e310370ba30d487f5ce68320a347d5d5056d87571e4b8',
  },
  {
    source: 'src/app/api/v1/views/current-inferencex-image/route.ts',
    path: '/api/v1/views/current-inferencex-image',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-current-inferencex-image-view',
    sourceSha256: '57af57766c20c31d5b445fe5b3dda34b83f6147457e7d14eb5ecfab8318eae20',
  },
  {
    source: 'src/app/api/v1/views/evaluation/route.ts',
    path: '/api/v1/views/evaluation',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-evaluation-view',
    sourceSha256: '7fa685a5cfb1ad82371b2476616033bb40ab94d94ca409ac7ad342f785216b98',
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
    sourceSha256: '4fd5f853b25171899f50da12c432cc71a814479ad712be45f7553caf172df04e',
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
    sourceSha256: '419f8e0435984317f2b485b334918d5657c7eabdfc33167cd7c90d1f160ba089',
  },
  {
    source: 'src/app/api/v1/views/historical/route.ts',
    path: '/api/v1/views/historical',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-historical-view',
    sourceSha256: '2a1de92d1c05201dbd10ce543c0d74a83fdab9713de707c054d1fcc105463002',
  },
  {
    source: 'src/app/api/v1/views/inference/route.ts',
    path: '/api/v1/views/inference',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-inference-view',
    sourceSha256: '198d4b0dbb2b9f9db862fd4c508610983fc9f3e919530d67112bb3253c0da3a5',
  },
  {
    source: 'src/app/api/v1/views/options/route.ts',
    path: '/api/v1/views/options',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-view-options',
    sourceSha256: '4ffb792fc7429f4dbc904e3c13f316a2eabff23fbe3c242b7b0ddd267bd90b39',
  },
  {
    source: 'src/app/api/v1/views/overview/route.ts',
    path: '/api/v1/views/overview',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-overview-view',
    sourceSha256: '9e8788833280732632b6e3bbe4db2bf3211f8eb0257a514f5f872f6aa3c6d354',
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
    sourceSha256: 'deb80405a8dd5c1aa2e805f825ad5d7a8e43213b800bebcffa05b49ce67f58da',
  },
  {
    source: 'src/app/api/v1/views/reliability/route.ts',
    path: '/api/v1/views/reliability',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-reliability-view',
    sourceSha256: '83234b0b52fe535be0fa0ab63319e0e08edc4fa8f6dfc8e4b2c3a164d329abcb',
  },
  {
    source: 'src/app/api/v1/views/submissions/route.ts',
    path: '/api/v1/views/submissions',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-submissions-view',
    sourceSha256: '7b08494c1b06f1db4b3ea2d287c6421efca5ffa46fb8a26f5f45a34bf0468497',
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
    sourceSha256: '237d7b2f095786cea52f8d65eaed73a4f091fa880803809271e2542b0d62b4d9',
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
    sourceSha256: '689fb55acd3e4cc503dc7de0582e633b6aea1b7fb84b56b960fb1adfd53c6c29',
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
    sourceSha256: '137c14ed0525accec6eeca1d2df5aa5f4052ad11c981e1029672301cd58f0497',
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
    sourceSha256: '8aacacfb787914cdaced89ecb3e42aa5954f8f53a71401c29889f62ab8d06f86',
  },
  {
    source: 'src/app/api/v1/operatorx/compare/route.ts',
    path: '/api/v1/operatorx/compare',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'OperatorX page backend; its cross-hardware comparison shape follows the page while it is being redesigned.',
      zh: 'OperatorX 页面后端；页面重新设计期间，其跨硬件对比结构随页面变化。',
    },
    sourceSha256: 'e7ade13f67a40e408371dece3fd676c547fcd2022d474ec5ca112e8cdb47131c',
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
    sourceSha256: '043866c831ca305a25bac5fd4dc04502c52e942543c1efa64dafa30e0f972dc5',
  },

  {
    source: 'src/app/api/v1/pareto/route.ts',
    path: '/api/v1/pareto',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-pareto',
    sourceSha256: '8a25d13ed86fb1cb4e821b73ead098e18a8e48e42919607eb66b494b8e0018e9',
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
    sourceSha256: '60ba50a0d1fe0f313dd544bb7198664a56395a18721952b56f0746ca61913f17',
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
      en: 'UI-only overlay for unofficial workflow artifacts. Development on loopback hosts may explicitly opt into local artifact files via INFERENCEX_LOCAL_ARTIFACT_DIR; production only reads the public GitHub source. Artifact availability and shape are not stable.',
      zh: '仅供界面叠加非官方工作流产物。开发环境通过本机地址访问时，可用 INFERENCEX_LOCAL_ARTIFACT_DIR 显式启用本地文件；生产环境仅从公开 GitHub 来源读取。产物的可用性和结构并不稳定。',
    },
    sourceSha256: 'f03c48912697be075fe1be44ec3fccc31a727b7524fb91ecefbeda7e3182dd30',
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
    sourceSha256: '772ccaae562e986705acf5b0c9ada981b88b17fe2997527574394879cf71e172',
  },
  {
    source: 'src/app/api/v1/benchmarks/history/route.ts',
    path: '/api/v1/benchmarks/history',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-benchmark-history',
    sourceSha256: '2b33a33b56ec5afb9c44ddc7db581686dec7488a397cd50c8efa810acff3a86c',
  },
  {
    source: 'src/app/api/v1/collectivex/latest/route.ts',
    path: '/api/v1/collectivex/latest',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-collectivex-latest',
    sourceSha256: 'c60fff45af91fa38a071fee69b253983fe403738f7e35c56711708b5b3cb2d70',
  },
  {
    source: 'src/app/api/v1/collectivex/runs/route.ts',
    path: '/api/v1/collectivex/runs',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-collectivex-runs',
    sourceSha256: '32eaf00f56cb30db70b128f9aa8ec1132c56d9b02c2c6728072fd5bb4c465258',
  },
  {
    source: 'src/app/api/v1/collectivex/runs/[runId]/route.ts',
    path: '/api/v1/collectivex/runs/{runId}',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-collectivex-run',
    sourceSha256: '960e59d2af33ddcc3995be78feac5a510cc5b194a3bcd0ec9f1a884501a1b711',
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
    sourceSha256: '960e59d2af33ddcc3995be78feac5a510cc5b194a3bcd0ec9f1a884501a1b711',
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
    sourceSha256: '3570ba13ba55ec09dd672707013b15c72833eb7ff6663e2fc4852be0be7ec0cd',
  },
  {
    source: 'src/app/api/v1/datasets/[slug]/conversations/route.ts',
    path: '/api/v1/datasets/{slug}/conversations',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-dataset-conversations',
    sourceSha256: '3d6511acb552535e1bb50e81fd5611a75af642cec7fa950d209565d189a6658d',
  },
  {
    source: 'src/app/api/v1/datasets/[slug]/conversations/[convId]/route.ts',
    path: '/api/v1/datasets/{slug}/conversations/{convId}',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-dataset-conversation',
    sourceSha256: 'f8287c716703c107232f6e104b38d7d2e7b074244fa9bf17dfc99dffec729c14',
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
      zh: '仅供界面读取由实时工作流制品支持的评测样本；该制品契约不稳定。',
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
    sourceSha256: '7307a4b3c6efb7e077ace44aa22e0e899a06a1a64964fde2805e13bc7a4768e5',
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
    sourceSha256: '6e2b697ca9a165e27e889dd71d1b9fb9d489e4ede3077ebb585e2d4c0f159d8a',
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
    sourceSha256: 'a4dc0b8c809837dfc33d78c8bd70ad8db78558ecee4ca2e857fa9b61f86d9b9a',
  },
  {
    source: 'src/app/api/v1/latest-images/route.ts',
    path: '/api/v1/latest-images',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-latest-images',
    sourceSha256: '71ad43e3caa358b27cc58fbc0adf4a110886790916b3cc1892905908db055b99',
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
    sourceSha256: '707b28a731310242571a5f07a334cb6bbec4ad137eb016fdbd375c8d0a0921e4',
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
    sourceSha256: 'f707e6e2f4d2eccf46882a89d73d26ba34ac4fa58e8bad925461aa7956e5a018',
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
    sourceSha256: '2aa86f78e160e00acf25fd688435544284ca4be0f05bfca1027fb0740258efb4',
  },
  {
    source: 'src/app/api/v1/server-log/route.ts',
    path: '/api/v1/server-log',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-server-log',
    sourceSha256: '07ef1ac2fcb6818ab9734b85ac5eb4f8b34420adbcc0089e3265bb3a59745454',
  },
  {
    source: 'src/app/api/v1/submissions/route.ts',
    path: '/api/v1/submissions',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-submissions',
    sourceSha256: '9276010b6e07ddc55b75946da4565bf3a746fdc6a641036301eaf6f78888c1d1',
  },
  {
    source: 'src/app/api/v1/tco-feed/route.ts',
    path: '/api/v1/tco-feed',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-tco-feed',
    sourceSha256: 'c8805dcf4d2eac4bced17bb5f3d9382d53d21d6833e32cefacefaa0ba2471e80',
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
    sourceSha256: '27ad0e76b8b1f145e3827e82acc3e0de3a17f65ce44cf56bd478bdbcee850a9e',
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
    sourceSha256: 'f18a38f7484cbd3bf4f1fac96a3ebd9fdd4451bc2b0bcffc7eccb1afe8b1f440',
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
    sourceSha256: 'a885ffc19a600c94d640116b04c53c62b03a8b186c59da8b07fcb34939c00cc8',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/inference/hooks/interpolated-trend-core.ts',
    sourceSha256: '86ef873a7c7f5542a7e88960c43172e8d29ff648b0404265bf0db6a215568cce',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/inference/hooks/chart-data-core.ts',
    sourceSha256: '006c535b98a0b13944d20b9216a3b6ec9c46ab27d79da4bf1fd95fda7bac28f5',
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
    sourceSha256: 'a50dd37bd10334b7804a531479795f7b83a407abc21a8ed3038c733d20425a95',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/source.ts',
    sourceSha256: '891ebd4c480cbebf8b711963102ab36d33b0cce682ff15545d8863df3a4567ef',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/series.ts',
    sourceSha256: 'f3f669c04e3a116c78d11eb3803bcd0b56fbd2eb772e102a963fdd75d8706419',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/registry.ts',
    sourceSha256: '04b833c0dbf1bfdc767aba5d7132b46c4ce9dd64134e3d1b7859b85053330e29',
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
    sourceSha256: 'cf710c1dca9cfae794cf3d14d3dad6a153bbd7151cedc9d9f0b27b792aeade24',
    reviewArea: {
      en: 'Public CDN tags, cache lifetimes, Blob key dimensions, and purge behavior.',
      zh: '公开 CDN 标签、缓存时长、Blob 键维度和清除行为。',
    },
  },
  {
    source: 'src/lib/cache/blob-cache.ts',
    sourceSha256: 'f15476f437c5ffea9d601d5ae1fa3dfafa77b1f53861ec02f0c359bf0f59c2ff',
    reviewArea: {
      en: 'Blob cache read, write, prefix migration, and purge behavior.',
      zh: 'Blob 缓存读取、写入、前缀迁移和清除行为。',
    },
  },
  {
    source: 'src/lib/api/cached-read-route.ts',
    sourceSha256: '3ba7f27e0378e9d03342df820690a699a1a7c37ef64abf273b07371796894d6d',
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
    sourceSha256: '32892e1725205dac69cc1a24fcffc4ed81039b89de7e227b5dbe71d525fdb708',
    reviewArea: {
      en: 'Shared positive-ID and ID-list validation, status codes, and error payloads for diagnostic reads.',
      zh: '诊断读取共享的正整数 ID 与 ID 列表校验、状态码和错误载荷。',
    },
  },
  {
    source: 'src/lib/api/api.ts',
    sourceSha256: '39beddbcbea7decf60f0e2e8217083e0c88516fab3181e3f2b94cdd1dca2b8f1',
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
    sourceSha256: '992d2325c9ff168cb25c19fbcb930d42d575cd6f634f9d994b8e427735d7ce2b',
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
