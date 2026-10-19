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
  readonly source: `src/app/api/${string}/route.ts`;
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
    sourceSha256: 'c6256d36fef097fa585430cba66920fff66a9dd43ed3039d91171fd79725a701',
  },
  {
    source: 'src/app/api/v1/views/collectivex/route.ts',
    path: '/api/v1/views/collectivex',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-collectivex-view',
    sourceSha256: '6289d211690dc9f8e2634419e5b13166a90dbc439aa17d8e15398ac08dddccb2',
  },
  {
    source: 'src/app/api/v1/views/compare/route.ts',
    path: '/api/v1/views/compare',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-compare-view',
    sourceSha256: '5f25b454ef2c96433a406b4b8f30419f096f6818529ade49675b26541b3f8e01',
  },
  {
    source: 'src/app/api/v1/views/current-inferencex-image/route.ts',
    path: '/api/v1/views/current-inferencex-image',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-current-inferencex-image-view',
    sourceSha256: 'ecd6ca8c83cc8a53fd1ce8f4e7598371be1559929e1bfe3e1afd3140e8197ed9',
  },
  {
    source: 'src/app/api/v1/views/evaluation/route.ts',
    path: '/api/v1/views/evaluation',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-evaluation-view',
    sourceSha256: '25f81858f36b2e12c3a903dca352b26461271d5313d420fd99fcea4e53044da0',
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
    sourceSha256: 'c31d5edcd8366864263a82fb3b12ddb75039e6d525945661b6d305ada5d01e16',
  },
  {
    source: 'src/app/api/v1/views/gpu-metrics/route.ts',
    path: '/api/v1/views/gpu-metrics',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-gpu-metrics-view',
    sourceSha256: 'f3a9cf104658d3c550dc047ae4f26b2871a244d3a68e83be1370046c35205d9e',
  },
  {
    source: 'src/app/api/v1/views/gpu-specs/route.ts',
    path: '/api/v1/views/gpu-specs',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-gpu-specs-view',
    sourceSha256: '4ce503336000f1547a34c734d7ca1b364ad9d7b8d90f5264d070083546ee0371',
  },
  {
    source: 'src/app/api/v1/views/historical/route.ts',
    path: '/api/v1/views/historical',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-historical-view',
    sourceSha256: '2ade55d809ceea83f0762f13a22d7111f19475023ff994423a9a4d221a1c8e8c',
  },
  {
    source: 'src/app/api/v1/views/inference/route.ts',
    path: '/api/v1/views/inference',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-inference-view',
    sourceSha256: '38fb9bd37657c7603c89057d318bd4ec46c4b19fe73ca67b32c4258559dd6d6a',
  },
  {
    source: 'src/app/api/v1/views/options/route.ts',
    path: '/api/v1/views/options',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-view-options',
    sourceSha256: '7f755e776a3a83a2069c5767a521f20982939104b950121c4008775deafff7be',
  },
  {
    source: 'src/app/api/v1/views/overview/route.ts',
    path: '/api/v1/views/overview',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-overview-view',
    sourceSha256: '51f1f953a9604a7061393760634c27fd413d2793f7aa60b703f787c2434e3d03',
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
    sourceSha256: 'a2a49a0a515235a0ed8fda2a6232c08c33dd5202a05e1d8c27ef34f5318798cf',
  },
  {
    source: 'src/app/api/v1/views/reliability/route.ts',
    path: '/api/v1/views/reliability',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-reliability-view',
    sourceSha256: '12234c81c8ce7ea37a2d9316d9e1e524ac035c1a4136aa22551ef4c637e2b1b4',
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
    sourceSha256: '73938eb6574bbe88b1e8061178aa69dc27fd7794dd509ac57eba4c11aa5c9cf0',
  },
  {
    source: 'src/app/api/v1/agentic-workload-explorer/cache/route.ts',
    path: '/api/v1/agentic-workload-explorer/cache',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Agentic Workload Explorer page backend over a frozen, anonymized ProxyTrace snapshot; response shapes follow the feature-gated pages and are not a stable public contract.',
      zh: 'Agentic Workload Explorer 页面后端，读取冻结的匿名 ProxyTrace 快照；响应结构跟随受功能开关控制的页面，不是稳定的公开契约。',
    },
    sourceSha256: '30037457a6c8d90f823be4e04c74cdc3f58387727d24b5d452d5641552750549',
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
    sourceSha256: '1c6ff60afbe1c177f9746d359c3e187dd44aab27f5f032d6b7775967aa75aa43',
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
    sourceSha256: '3e0d94af6f69de7554e4db1bb850ee7399ed7e62cab71a61690dd4cd94e79022',
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
    sourceSha256: '0d4374693a82a606e71c7508400a37a76be16ba0ea1b3ecc81807ea2fb120f70',
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
    sourceSha256: 'e77964bb3061d08494b633fc2817f15779bfbba45b08d30e7eed362fecf2ae2b',
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
    sourceSha256: 'a71a00b2715dd0f570502232e4188984345633a79242258e2f0e3b24003aa5a2',
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
    sourceSha256: 'e05c3a9e829fbcaf4b04042eed0a427977c6a8af9e9f397e62614b765f2d5437',
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
    sourceSha256: '23e5f397ab4c7ced4c9732e440ae3684894f13556bd5521eba54b665cc994d20',
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
    sourceSha256: '165441aa676d64ec0a8901f2a2bb3fdac3500561bf56ba707c49688fa47ecef1',
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
    sourceSha256: '1f389a5d4360b4095778d08788bd2aab1302298fdf3a687fe20a52b40148440d',
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
    sourceSha256: 'a3a14cdcf11ef5c0f2260baa0c268558c8423ada7824d41cf1b2c8454192837d',
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
    sourceSha256: '37640dad84b63f21007b259631759b850376b245d8fe55d9c97a0889e4c99d9a',
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
    sourceSha256: '35bc55762381c085455119c4190f42b11c6f5d707c7b424c77d293d522eb2e42',
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
    sourceSha256: '3f68950076f353135c6cd989ecf71f148fed8670dd46c92d589e345c8f489932',
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
    sourceSha256: '41b0c4a4ac0ce4e7656ae5b9209dd092f7cd60b19f583230d3ddef1c5e194b7c',
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
    sourceSha256: 'e8de3975b8a85b6e7f29c71103cf532261b65b17fb65d56e2a4eee2f1f04e195',
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
    sourceSha256: '942b301fe2edd823a072c2e68d41ca0f04d323089e6966bb238dd488d9278994',
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
    sourceSha256: '74942336a2c5516990ea654be41144eb896a003b49df4772d3bc7779c98273ee',
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
    sourceSha256: 'cd00408d7fd8e11ef88bbae17db5d409a81d4e290c3e103ab94950d83eab49a6',
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
    sourceSha256: 'bc614f93e8b6cda633496ff001e244cef90b1ee86887606b54c736373dfa8688',
  },
  {
    source: 'src/app/api/v1/views/ubenchx/route.ts',
    path: '/api/v1/views/ubenchx',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-ubenchx-view',
    sourceSha256: '7c2f5f5e51032435fc120a97408d788cd908b11603eebef241baef840961aaed',
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
    sourceSha256: 'ab86c973bd0b80745025df8a4a80b78208c93a3a4bbde3f18f921a9e783b1410',
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
    sourceSha256: 'e439bea3b3c2cbcad646bd9981c29c341923c32eeec8ab240febdff36df6b18c',
  },

  {
    source: 'src/app/api/v1/pareto/route.ts',
    path: '/api/v1/pareto',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-pareto',
    sourceSha256: '49ae347222bb3dcced2c3d1f468e1f6174ea34f99f26d13c34106bed21b3302e',
  },
  {
    source: 'src/app/api/gpu-metrics/route.ts',
    path: '/api/gpu-metrics',
    method: 'GET',
    classification: 'ui-artifact-read',
    exclusionReason: {
      en: 'PowerX raw/series=power read used by the UI and, in-process, by the public GPU metrics view: one source per run (the DB when the run has stored telemetry, otherwise its GitHub artifacts, never combined), separate host/GPU identities and adjacent CSV context timezone normalization. runId must be a positive safe integer. Stored raw reads report run-wide coverage as complete, partial or unknown inventory; missingArtifacts names wholly missing artifacts. Raw native bundles expose optional Celsius temperature when no CSV sibling exists. GET has no expected identities and reports sourceCoverage unknown. Live windows are unique by validation source, preferring CSV over bundle. DB failures return 503 DATABASE_UNAVAILABLE; known-incomplete stored telemetry returns 503 STORED_TELEMETRY_INCOMPLETE without trying GitHub. Responses use no-store. This is not a stable public API.',
      zh: '供 PowerX 界面读取原始遥测或 series=power，公开 GPU 指标视图也在进程内调用：每个 run 只使用一个数据来源（遥测已入库时只读 DB，否则只读该 run 的 GitHub 产物，两者不混用），保留主机/GPU 身份，并按相邻 CSV context 规范化时区。runId 必须为正安全整数。数据库原始读取的 coverage 标明整个 run 的清单完整、部分缺失或未知，missingArtifacts 列出整体缺失的产物。没有对应 CSV 时，原生 bundle 的原始数据包含可用的 GPU 温度（摄氏度）。GET 没有预期身份清单，sourceCoverage 为 unknown。实时窗口按 validation source 去重，优先 CSV，再用 bundle。数据库故障返回 503 DATABASE_UNAVAILABLE；若已入库的遥测已知不完整，则返回 503 STORED_TELEMETRY_INCOMPLETE，不会转而读取 GitHub。响应使用 no-store，不作为稳定公开 API。',
    },
    sourceSha256: '95683b22f998a0537f8ed61779d72bd5e9d870428c3db9f9102fbc99ad64c7ce',
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
    sourceSha256: '95683b22f998a0537f8ed61779d72bd5e9d870428c3db9f9102fbc99ad64c7ce',
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
    sourceSha256: '1276d095ca73f2440cbe3f33a3ab172120a2c2665a4817696647260874f5b9a2',
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
    sourceSha256: '591646ad1f7ab4247487262ed5d55ecd012ecfe4d35db4cadeaebe04a26276c4',
  },
  {
    source: 'src/app/api/v1/agentic-aggregates/route.ts',
    path: '/api/v1/agentic-aggregates',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-agentic-aggregates',
    sourceSha256: '0cd946f44b63ea2f7f860253be0e1348950f057e12329e2249c6c0d0198c0ddf',
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
    sourceSha256: '9d579221b2b30b579b7d25e96f9de738e383869230e441e175b09f39a608b2fb',
  },
  {
    source: 'src/app/api/v1/benchmarks/route.ts',
    path: '/api/v1/benchmarks',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-benchmarks',
    sourceSha256: '09cb9e6f1fbd93ca41b3052ccb880a160bba47946641c61a29158363acf0b0f3',
  },
  {
    source: 'src/app/api/v1/benchmarks/history/route.ts',
    path: '/api/v1/benchmarks/history',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-benchmark-history',
    sourceSha256: '3f7d7d675077c212917d481e4f7076f62622a09b9d36ca73f541608310b3d25c',
  },
  {
    source: 'src/app/api/v1/collectivex/latest/route.ts',
    path: '/api/v1/collectivex/latest',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-collectivex-latest',
    sourceSha256: '10aad49ad7bd9204095aa1009c6abd9a908afe787546abd0f6c9ff607b6c4949',
  },
  {
    source: 'src/app/api/v1/collectivex/runs/route.ts',
    path: '/api/v1/collectivex/runs',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-collectivex-runs',
    sourceSha256: '9798e531cb75f747dd0dad03efe94c519279fb924fb5952536734146832d7e5a',
  },
  {
    source: 'src/app/api/v1/collectivex/runs/[runId]/route.ts',
    path: '/api/v1/collectivex/runs/{runId}',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-collectivex-run',
    sourceSha256: '68be4ede90a60e6a4e027a99e86d80c88cec6d3dc63308f8c6f86d6d774e97ab',
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
    sourceSha256: '68be4ede90a60e6a4e027a99e86d80c88cec6d3dc63308f8c6f86d6d774e97ab',
  },
  {
    source: 'src/app/api/v1/datasets/route.ts',
    path: '/api/v1/datasets',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-datasets',
    sourceSha256: 'aeea77c06206f9eb4f1230cc33ddc013052cdb5dcd21b10fd784875577bb4afd',
  },
  {
    source: 'src/app/api/v1/datasets/[slug]/route.ts',
    path: '/api/v1/datasets/{slug}',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-dataset',
    sourceSha256: 'd2dfefb9857d0b20972130b1083d8dda8a73a61b884215d9e41f0938a4e36b14',
  },
  {
    source: 'src/app/api/v1/datasets/[slug]/conversations/route.ts',
    path: '/api/v1/datasets/{slug}/conversations',
    method: 'GET',
    classification: 'published-read',
    operationId: 'list-dataset-conversations',
    sourceSha256: 'a6e74c9b2fa601f3b6efba201e999f29fc7295984fe3d5d5f9e78f027e6e28eb',
  },
  {
    source: 'src/app/api/v1/datasets/[slug]/conversations/[convId]/route.ts',
    path: '/api/v1/datasets/{slug}/conversations/{convId}',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-dataset-conversation',
    sourceSha256: '0226e76cc6871832c4d6bbee2f6a4dcbf330e163e2402031a88692b65841dead',
  },
  {
    source: 'src/app/api/v1/derived-agentic-metrics/route.ts',
    path: '/api/v1/derived-agentic-metrics',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-derived-agentic-metrics',
    sourceSha256: '72cbe600ebaa71ce37cf2587a7f6ebcb00b4f95e82986638922d20b9607f487a',
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
    sourceSha256: 'f801aaa67c42f361a8735488b121f05f05102a15691c19f9af08076e815ae4fc',
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
    sourceSha256: '52437e592375264980c92b25958ad93a86fa2924756c9d6b1295bdc696a86736',
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
    sourceSha256: '7e04dc909ac8b9e325eb58b8d5dab221b3ceaa402204216faf9ac32f7fb89fd9',
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
    sourceSha256: '1ec0a81e51679b35feb6c5bad1ba7b9a4f81691be729880b2ffa6842544b8a26',
  },
  {
    source: 'src/app/api/v1/framework-releases/route.ts',
    path: '/api/v1/framework-releases',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-framework-releases',
    sourceSha256: 'b6dba69d384aea3a2e1890ed4f01cf9f4b8d89bee3664e901dfd9d9240b712a1',
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
    sourceSha256: '88bc77a0213a3418d002e5c301e43fc836a185f5c038f25bd42c26f28c86738d',
  },
  {
    source: 'src/app/api/v1/latest-images/route.ts',
    path: '/api/v1/latest-images',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-latest-images',
    sourceSha256: '863e6e912b16c354a077fe247a88899c2c219ffd593557edb8e9e1ba8ed99e89',
  },
  {
    source: 'src/app/api/v1/log-availability/route.ts',
    path: '/api/v1/log-availability',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-log-availability',
    sourceSha256: 'dc6f0960b480e0e377a45c491eb7d15896f9d8a6dd1c98a7863152d33381e3cd',
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
    source: 'src/app/api/v1/gpu-metrics-point/route.ts',
    path: '/api/v1/gpu-metrics-point',
    method: 'GET',
    classification: 'page-bff',
    exclusionReason: {
      en: 'Point-detail BFF accepting a positive safe-integer id and returning linked PowerX telemetry series, per-GPU statistics computed from their stored samples and retained validation/audit metadata. Every read checks a live DB revision before using the Blob payload cache; responses use no-store, missing data returns 404, and database failures remain errors. Re-ingest, shared-link and statistics algorithm version changes do not require manual cache purges. The CI publication verifier reads it after each telemetry ingest. Coupled to the PowerX tab implementation.',
      zh: '数据点详情 BFF；id 必须为正安全整数，返回关联的 PowerX 遥测序列、由已存样本计算的每 GPU 统计，以及保留的验证与审计元数据。每次读取先核对数据库版本再使用 Blob 缓存；响应使用 no-store，数据缺失返回 404，数据库故障仍作为错误返回。重新入库、共享链接及统计算法版本变化无需手动清理缓存。CI 发布校验会在每次遥测入库后读取此接口。与 PowerX 标签页实现紧密耦合。',
    },
    sourceSha256: '91dd0403cf31ad442a0bcbe19f42e0400c11445d9d247cb0d9bc29ade1c1d123',
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
    sourceSha256: 'ba669d20686063028db69ecd1689c13eca0bc448339387a8581e056f6b483623',
  },
  {
    source: 'src/app/api/v1/request-timeline/route.ts',
    path: '/api/v1/request-timeline',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-request-timeline',
    sourceSha256: 'e1649367d090f2f68d0ce1cf624d2f9f380b703de412aa5ccc961878ad31ad0d',
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
    sourceSha256: '99d92e29348b571591c4536222361e48cf5434f042f01c90933d50c11ec7fb8a',
  },
  {
    source: 'src/app/api/v1/server-log-files/route.ts',
    path: '/api/v1/server-log-files',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-server-log-files',
    sourceSha256: 'dbefcef44a461f878930a5193c0f19ccbffb66b4392de8d0184883dec15126ad',
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
    sourceSha256: '225fdcf56599692df62e4eb1703d30f298ccef2919220c35ec69e0c77285aed6',
  },
  {
    source: 'src/app/api/v1/trace-availability/route.ts',
    path: '/api/v1/trace-availability',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-trace-availability',
    sourceSha256: '9fa95f82b6f24403221a5f1d6fb98ad7c2daaebdfca0fbf6aaac32ff8ab814bc',
  },
  {
    source: 'src/app/api/v1/trace-histograms/route.ts',
    path: '/api/v1/trace-histograms',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-trace-histograms',
    sourceSha256: '0fdfb0c1d7c6071d85e9d306d349c37301caf9bf8a5f2e995a185ab1980576b1',
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
    sourceSha256: 'adab3d6913408037642646bb01d83dc44ccef86caad69e06a13f3e0804574e6a',
  },
  {
    source: 'src/app/api/v1/trace-server-metrics/route.ts',
    path: '/api/v1/trace-server-metrics',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-trace-server-metrics',
    sourceSha256: '36304a2fff7851c59a9993b7114e507610f5e6dcd937b0687420ed86fb2bf0ba',
  },
  {
    source: 'src/app/api/v1/workflow-info/route.ts',
    path: '/api/v1/workflow-info',
    method: 'GET',
    classification: 'published-read',
    operationId: 'get-workflow-info',
    sourceSha256: '5fe30002ca9e25b45b6790b09879cd498ca14dd737d048fa6cb8832ccaef274a',
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
  readonly source: string;
  readonly sourceSha256: string;
  readonly reviewArea: BilingualReviewText;
}

export const apiContractSourceDigests = [
  {
    source: 'src/app/api/gpu-metrics/artifact-selection.ts',
    sourceSha256: '73576a8b142cc5f83144fd0cf1a6f47504ca0914d5a605f051ddb2ab4fb13ea1',
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
    sourceSha256: '85089e7a0bc54efd3b5f1e57e44fdb381b3cb14f037d6d594a3b83aadb8ecef3',
    reviewArea: {
      en: 'Stored PowerX telemetry reads: latest attempt, prefix and requested-source scoping, GPU metrics view artifact selection, point lookups, run inventory coverage, missing metric readings and per-GPU statistics computed from complete stored samples.',
      zh: '数据库 PowerX 遥测读取：最新 attempt、前缀与请求 source 范围、GPU 指标视图的产物选择、单点查询、run 清单覆盖范围、缺失指标读数，以及基于完整已存样本计算的每 GPU 统计。',
    },
  },
  {
    source: 'src/app/api/gpu-metrics/github-telemetry.ts',
    sourceSha256: 'c4ba9a5f850a42610b15e3ce78697cf02b1a5d5d0bbdd375595592cd8e6cbc59',
    reviewArea: {
      en: 'Live PowerX artifact selection with ingest-matching CSV precedence for equal suffixes, download bounds, per-artifact failure isolation, CSV context normalization and bundle decoding.',
      zh: 'PowerX 实时产物选择沿用 ingest 的同后缀 CSV 优先规则、下载限制、单产物故障隔离、CSV context 规范化及 bundle 解码。',
    },
  },
  {
    source: 'src/components/calculator/profit-power.ts',
    sourceSha256: '957f4d02e36929693377bc22168d5a80b1fbb7b43da7b41a1b7049bacced80b2',
    reviewArea: {
      en: 'Power-valid curve selection at fixed targets, compatible power bases, paired throughput and provisioned fallback shared by Profit UI and API.',
      zh: '利润界面与 API 共用的有效功耗曲线选择、固定目标值、功耗口径兼容性、配对吞吐量与预配估算回退。',
    },
  },
  {
    source: 'src/components/inference/utils/inference-table-data.ts',
    sourceSha256: '21a0d4fae68be726e337e3ad0eb1634d49109e9f1e88f1aab4beb7b5ec901c8d',
    reviewArea: {
      en: 'All in Measured table eligibility, nullable values and unavailable reasons shared by UI, CSV and public views.',
      zh: '界面、CSV 和公开视图共用的整体实测表格行筛选、可空数值与不可用原因。',
    },
  },
  {
    source: 'src/components/inference/utils/resolveXAxisField.ts',
    sourceSha256: '9cdbc86cea365eb0193653f27e4eb124f2bca98d3bdee153f99b4a9173f886ae',
    reviewArea: {
      en: 'Shared service-axis resolution: fixed-sequence mean/median, reciprocal mean TPOT, and AgentX percentile isolation.',
      zh: '共用服务轴解析：固定长度工作负载 mean/median、mean TPOT 的倒数，以及 AgentX 独立的分位数选择。',
    },
  },
  {
    source: 'src/components/inference/utils/equal-service-comparison.ts',
    sourceSha256: '9394446f610cea0b825db249b6fcdaff8c36bf30694df3f5828105f0049f62b0',
    reviewArea: {
      en: 'Source-scoped equal-service interpolation, comparator-relative changes, endpoint provenance, prefill share projection and role points.',
      zh: '按完整来源限定的同等服务插值、相对基准变化、端点来源、prefill 占比视图以及各角色数据点。',
    },
  },
  {
    source: 'src/components/inference/utils/matched-concurrency.ts',
    sourceSha256: '057bebd1ca31e674a3eaabe28112a5fc021e9182c76f970695e96579e5a58706',
    reviewArea: {
      en: 'Same-concurrency pairing of two exact sources: missing and conflicting observations, signed comparator-relative changes, no interpolation.',
      zh: '两个完整来源在相同并发下的配对：缺失与冲突观测、相对基准的带符号变化，不做插值。',
    },
  },
  {
    source: 'src/components/inference/utils/power-fit.ts',
    sourceSha256: '2c2eef25f693823ce3e015780102cefea3e9345231cbb9df12a08ff50d12db4d',
    reviewArea: {
      en: 'Per-source least-squares power fit on output per allocated GPU: intercept, marginal J/token, R², fitted range and registry TDP.',
      zh: '按来源对每个已分配 GPU 的输出做最小二乘功耗拟合：截距、边际 J/token、R²、拟合范围与注册表 TDP。',
    },
  },
  {
    source: 'src/components/inference/utils/role-energy.ts',
    sourceSha256: 'df72a4a2d981932bc68d6c1aaeb3c2115e664541baba6e74c72a4fbe4a3a872c',
    reviewArea: {
      en: 'Validated prefill/decode energy reconstruction and shares on a common output-token denominator.',
      zh: '使用统一 output token 分母的已验证 prefill/decode 能耗重建与占比。',
    },
  },
  {
    source: 'src/lib/benchmarks/benchmark-transform.ts',
    sourceSha256: 'ce4d3f67a0602327c9c7fbdfedec5140bc1aa7bac05f2a0839c2e07adee7139a',
    reviewArea: {
      en: 'Raw benchmark means and derived reciprocal mean-TPOT interactivity used by Dashboard and read-only views.',
      zh: '仪表板和只读视图共用的原始 benchmark 均值与 mean TPOT 倒数形式的 interactivity。',
    },
  },
  {
    source: '../db/src/etl/power-audit-validations.ts',
    sourceSha256: '07005e402969c54aca6d5a9595c008bc8da1f23dfd0f8b82df184da6f3272261',
    reviewArea: {
      en: 'Shared legacy and nested AgentX validation identity normalization for artifact and stored Timeline windows.',
      zh: '产物与数据库 Timeline 窗口共用的 legacy 和嵌套 AgentX validation 身份规范化。',
    },
  },
  {
    source: 'src/components/gpu-power/power-audit-bundle.ts',
    sourceSha256: 'bd791ed2fdfd23d5f7e38bb51c03dab637421c37c43fef4f8e808411f5a56586',
    reviewArea: {
      en: 'Artifact Timeline validation windows, strict nested AgentX result identity, adjacent context selection, timezone normalization and device identity semantics.',
      zh: '产物 Timeline 验证窗口、严格匹配的嵌套 AgentX result 身份、相邻 context 选择、时区规范化及设备身份语义。',
    },
  },
  {
    source: 'src/components/gpu-power/stored-gpu-stats.ts',
    sourceSha256: '0f909094716e720fb84c6eaefa7235b1bc47050c45cec12b689bf8d6c4b36433',
    reviewArea: {
      en: 'Full-record GPU metric mappings for stored statistics, metrics without readings, and stored/live statistics parity.',
      zh: '数据库统计的全记录 GPU 指标映射、无读数指标的处理，以及数据库统计与实时产物统计的一致性。',
    },
  },
  {
    source: 'src/components/gpu-power/types.ts',
    sourceSha256: '16afdae08570ca86b04e2b01f00b10765c479c7f16b6542eb46fb622f86b5be0',
    reviewArea: {
      en: 'GPU telemetry units, missing values, timestamp deduplication, and full-record live statistics definitions.',
      zh: 'GPU 遥测单位、缺失值、时间戳去重，以及实时产物全记录统计的定义。',
    },
  },
  {
    source: 'src/components/calculator/profit-estimator.ts',
    sourceSha256: '548bb24fb7933b6e87f7b36f505a858e34e16ccfc7906d3793c46aeea79a91ef',
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
    sourceSha256: '2128a46679bcc230fb639b3b2f7b05db14ace50389c2a4a93cb64c905fe86409',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/gpu-power/chart-data.ts',
    sourceSha256: 'a3c451ea3939d43babfdab5399c6d5bb0c96b8b84fdee0167d59f28da73fbcd5',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/evaluation/date-resolution.ts',
    sourceSha256: 'f6c649404a13ca034f74bb58a344e07b5062b6d979a65816288c0d4985c873b5',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/reliability/aggregate.ts',
    sourceSha256: '5a165bbbb33663355265e2818134db685ac58615ac5497a8c0e3d8a8b1d50f55',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/inference/hooks/interpolated-trend-core.ts',
    sourceSha256: 'd4af5837d1ce3b3f07b372cb30efa12703bdad6678ac9e22092ce2433f365aec',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/inference/hooks/chart-data-core.ts',
    sourceSha256: 'e70f95cf290bf389987b360a23b7fb9614e9623c9ed50be867eb2aaf65c068e2',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/calculator/power-ranking.ts',
    sourceSha256: '0439c57a08d760c7e114e20c183dca5d388cd8cd897e2038ca768bca3f6ac9b6',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/calculator/throughput-data.ts',
    sourceSha256: '09f8a4065ce0fc273d32e61fad9ad8f1dedd77095538867948cce5f8fd0c32ad',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/errors.ts',
    sourceSha256: 'a1638b23a5c2fe121bdaf13ea7ed1c63969fcf8ac1b3fb1075ff2673218344f9',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/calculator-extensions.ts',
    sourceSha256: '18d4f9bd2c013fa7e3a7278d4081db856630432ae0c4365d15ff04a7363ef220',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/source.ts',
    sourceSha256: '9d4eed136d4b8c80e205d9dd479345aab61741d69e8d493426536d8de6dc74c1',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/components/inference/utils/model-defaults.ts',
    sourceSha256: 'dc194c4011a90bf5f9cce884f855b6839d6d1fffc5fdbefe3c14829a29162b08',
    reviewArea: {
      en: 'Inference model-specific axis and hardware defaults.',
      zh: '推理视图的模型特定坐标轴和硬件默认值。',
    },
  },

  {
    source: 'src/lib/views-api/series.ts',
    sourceSha256: 'b2db3e4136e9226eab60cf61e71408269ff2e941a7a721e8f2dd2fd742e724cd',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/registry.ts',
    sourceSha256: '6b86b34e65d098967d66bc39850f2a616c42b870e94ec9108ab6bfa2e3b34c4a',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/views-api/params.ts',
    sourceSha256: '50bd9c7c4fbbef5e4fdd48b44c37b158fe985d9c5c47aeaa4577d8be71666614',
    reviewArea: {
      en: 'Dashboard read-only selector and calculation parity.',
      zh: '仪表板只读接口的选择项与计算一致性。',
    },
  },

  {
    source: 'src/lib/api/pareto-api.ts',
    sourceSha256: '144acc79a155d66b5d38ce0bbd5e007b822e0643b9d65b124e4a70b78c1f4bf9',
    reviewArea: {
      en: 'Pareto selectors, validation, source scope, missing-axis counts and boundary observations.',
      zh: 'Pareto 选择条件、验证、来源范围、缺失坐标计数和边界观测值。',
    },
  },
  {
    source: 'src/lib/charts/pareto-frontier.ts',
    sourceSha256: '193f8704c50f700921bc8d48923a78677d595d53ecdfcadc7101a13dbe2154e7',
    reviewArea: {
      en: 'Shared chart/API dominance directions, tie handling and boundary ordering.',
      zh: '图表与 API 共用的支配方向、同坐标处理和边界排序。',
    },
  },
  {
    source: 'src/lib/cache/api-cache.ts',
    sourceSha256: '6d08511202cced4b07e2b47fd4164e54a761873072e60a133a4d6e7f15f031ba',
    reviewArea: {
      en: 'Public CDN tags, cache lifetimes, Blob key dimensions, and purge behavior.',
      zh: '公开 CDN 标签、缓存时长、Blob 键维度和清除行为。',
    },
  },
  {
    source: 'src/lib/cache/blob-cache.ts',
    sourceSha256: '7213fc6e5fa74a28475cc6e70902bd2682765125a18d894b43f249702e317da8',
    reviewArea: {
      en: 'Blob cache read, write, prefix migration, and purge behavior.',
      zh: 'Blob 缓存读取、写入、前缀迁移和清除行为。',
    },
  },
  {
    source: 'src/lib/api/cached-read-route.ts',
    sourceSha256: '1623ae66998379330a8cb0bcff4c276cd72d24a894d322edd4ccb301a2c2bb86',
    reviewArea: {
      en: 'Shared parameterless cached-read fixture, response, and public-error behavior.',
      zh: '共享无参数缓存读取的夹具、响应和公开错误行为。',
    },
  },
  {
    source: 'src/lib/api/bearer-auth.ts',
    sourceSha256: '41e1e2dde10181b6f3de6140d258544ebc1e5906a5c1777d6d15bf01f6d6c82f',
    reviewArea: {
      en: 'Byte-safe constant-time Bearer credential comparison used by administration routes.',
      zh: '管理路由使用的字节安全恒定时间 Bearer 凭据比较。',
    },
  },
  {
    source: 'src/lib/api/public-api-errors.ts',
    sourceSha256: '45c5f733fb55d114de1b5da252800b5f62780e7163de092c752866c91acad605',
    reviewArea: {
      en: 'Canonical public JSON error strings shared by handlers and OpenAPI examples.',
      zh: '处理程序与 OpenAPI 示例共享的规范公开 JSON 错误字符串。',
    },
  },
  {
    source: 'src/lib/evaluation/eval-sample-params.ts',
    sourceSha256: 'a04b845dcfcd8b3700c4742b4bdf2da631f3295b24a7e8ccb270f4eae0576b5c',
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
    sourceSha256: 'b131cd9c5926f93794e9fd5b3fce590bf492dad407471e716d12725ccf69304a',
    reviewArea: {
      en: 'Client-side persisted benchmark identifier recognition.',
      zh: '客户端持久化基准标识符识别。',
    },
  },
  {
    source: 'src/app/api/v1/id-routes.ts',
    sourceSha256: '4d0ae65ebc82669b5812412eaa0783917151a96e6eac436ac0f01d0b71f51eb2',
    reviewArea: {
      en: 'Shared positive safe-integer single-ID and ID-list validation, status codes, and error payloads for diagnostic reads.',
      zh: '诊断读取共享的正安全整数单 ID 与 ID 列表校验、状态码和错误载荷。',
    },
  },
  {
    source: 'src/lib/api/api.ts',
    sourceSha256: '3778b8ed4ccba2bb043c10fcd695f060ac438a3ca668e958459332b3ed34f950',
    reviewArea: {
      en: 'Public API client parameter serialization and TypeScript response contracts.',
      zh: '公开 API 客户端的参数序列化和 TypeScript 响应契约。',
    },
  },
  {
    source: 'src/lib/overview/overview-data.ts',
    sourceSha256: '0a4ebf4764257c1111ca543ec2bc492d906237c931484c39357c3d8134065f3d',
    reviewArea: {
      en: 'Overview BFF tier, engine, comparison-window, reference, and model-scope parameters plus the OverviewPageData response shape.',
      zh: '概览 BFF 的档位、引擎、对比时间窗口、参考硬件和模型范围参数，以及 OverviewPageData 响应结构。',
    },
  },
  {
    source: 'src/lib/calculator/tco-feed.ts',
    sourceSha256: '6c28d1e8421320d997bf09f41e49494597f97843d93a1f2fcf61e0f1fe18ef01',
    reviewArea: {
      en: 'TCO workload, tier, score, point, and CSV/JSON response semantics.',
      zh: 'TCO 负载、档位、评分、数据点以及 CSV/JSON 响应语义。',
    },
  },
  {
    source: '../constants/src/models.ts',
    sourceSha256: '052abcd87ddf2702d02c5510f09f739a87d8a82595fb52823ef156d72a1584d4',
    reviewArea: {
      en: 'Published benchmark and TCO model names, aliases, and parameter enums.',
      zh: '已发布基准与 TCO 模型名称、别名和参数枚举。',
    },
  },
  {
    source: '../db/src/collectivex/types.ts',
    sourceSha256: 'e7ca63508b6b84d6c730ccae997bae7ba5ccc4e4d7c38d38b101676bd0f63117',
    reviewArea: {
      en: 'CollectiveX version negotiation and versioned dataset/run response types.',
      zh: 'CollectiveX 版本协商以及带版本的数据集与运行响应类型。',
    },
  },
  {
    source: '../db/src/etl/compute-request-timeline.ts',
    sourceSha256: 'dffe093f7da0f200ecdf5ab640611d2284b10b3b0e14c9144f21808edb152a2c',
    reviewArea: {
      en: 'Request timeline contract version, replay identity, source provenance, and event timing semantics.',
      zh: '请求时间线契约版本、重放标识、来源溯源和事件计时语义。',
    },
  },
  {
    source: '../db/src/queries/agentic-aggregates.ts',
    sourceSha256: 'ddb25f5958384fd4d1b942c2c78066142891dd09fc9a7210036cc349ff0f4c82',
    reviewArea: {
      en: 'Agentic aggregate percentile keys, nullability, and ID-keyed response shape.',
      zh: '智能体汇总百分位字段、可空性和按 ID 索引的响应结构。',
    },
  },
  {
    source: '../db/src/queries/benchmark-siblings.ts',
    sourceSha256: '48c637e9c9f13c4d771bd197ff0fdf8f33368febb37de4100d03bd180a89395f',
    reviewArea: {
      en: 'Benchmark sibling SKU metadata and sibling navigation row shape.',
      zh: '基准同组 SKU 元数据和同组导航行结构。',
    },
  },
  {
    source: '../db/src/queries/benchmarks.ts',
    sourceSha256: '121f97b5502790009aaebc8ff155028ae4eb3b83d2df9f22614f0f7c5ef761c9',
    reviewArea: {
      en: 'Benchmark row fields and latest, exact-run, history, and TCO query semantics.',
      zh: '基准行字段以及最新、精确运行、历史和 TCO 查询语义。',
    },
  },
  {
    source: '../db/src/queries/collectivex.ts',
    sourceSha256: '346674ee9c8c3fdc8e7ce3447680714b776428b8f3044403ae3fc664e867027b',
    reviewArea: {
      en: 'CollectiveX dataset projection, run summaries, coverage, series, and discovery state.',
      zh: 'CollectiveX 数据集投影、运行汇总、覆盖范围、序列和发现状态。',
    },
  },
  {
    source: '../db/src/queries/datasets.ts',
    sourceSha256: '269355123daa86690b213194d6ed3048256a22a3389fcfac85447208a6b7ef59',
    reviewArea: {
      en: 'Dataset registry, detail, conversation index, pagination, and conversation structure responses.',
      zh: '数据集目录、详情、会话索引、分页和会话结构响应。',
    },
  },
  {
    source: '../db/src/queries/evaluations.ts',
    sourceSha256: '7aa007fbc54b0a5d4238976b7520fd1bfeb3f44007db1a7e6752447506bba71b',
    reviewArea: {
      en: 'Evaluation aggregate result fields, provenance, metrics, and latest-attempt selection.',
      zh: '评测汇总结果字段、来源、指标和最新尝试选择。',
    },
  },
  {
    source: '../db/src/queries/latest-images.ts',
    sourceSha256: '12de84d89ee724ddb4bb213ca795d90f865e6d30bfdaee0f3894dfb24d045e74',
    reviewArea: {
      en: 'Latest runtime image row fields and per-configuration selection.',
      zh: '最新运行时镜像行字段和按配置选择逻辑。',
    },
  },
  {
    source: '../db/src/queries/reliability.ts',
    sourceSha256: '6586ad54b4b4f393ca8be037324f0c44a5b76843674ca34c40722a8935ea2e7a',
    reviewArea: {
      en: 'Reliability success/total count fields and grouping semantics.',
      zh: '可靠性成功数/总数的字段和分组语义。',
    },
  },
  {
    source: '../db/src/queries/request-timeline.ts',
    sourceSha256: 'e2c8ffd80e8fa0fb09662ba4c6542f9c2f695af3621572fb710387e1d342641a',
    reviewArea: {
      en: 'Request timeline metadata, request event records, units, and nullable timings.',
      zh: '请求时间线元数据、请求事件记录、单位和可空计时字段。',
    },
  },
  {
    source: '../db/src/queries/server-logs.ts',
    sourceSha256: 'bfce33db5f948926f23cdcb65cd718ebcfb1dfc1baa001fdb35170f67bddf836',
    reviewArea: {
      en: 'Log filename discovery, selected-file reads, bounded chunk metadata, complete-file search, availability, and legacy-schema fallback.',
      zh: '日志文件名发现、指定文件读取、有界分块元数据、完整文件搜索、可用性以及旧版 schema 回退行为。',
    },
  },
  {
    source: '../db/src/queries/submissions.ts',
    sourceSha256: 'c827d76347a79129b7b9f4c8de20ada54e5f3ca32704eb243de737df482e4cae',
    reviewArea: {
      en: 'Submission summary and daily hardware volume row fields.',
      zh: '提交汇总和每日硬件提交量行字段。',
    },
  },
  {
    source: '../db/src/queries/trace-availability.ts',
    sourceSha256: 'd3d8a8ab134bdee2a2d9b02d9725fa244c6b594df6fdc9e5393ca37a1cb8bf35',
    reviewArea: {
      en: 'Trace availability ID-keyed boolean response shape.',
      zh: '跟踪可用性按 ID 索引的布尔响应结构。',
    },
  },
  {
    source: '../db/src/queries/trace-histograms.ts',
    sourceSha256: '5f59cd5f2309b4c5d0dd17b66eff62268c99089c032f5e8ab44b8b883de9831c',
    reviewArea: {
      en: 'Trace histogram input/output token arrays and ID-keyed response shape.',
      zh: '跟踪直方图输入/输出 token 数组和按 ID 索引的响应结构。',
    },
  },
  {
    source: '../db/src/queries/trace-server-metrics.ts',
    sourceSha256: '96cdce93d66caf08261b22d1b31db1ec337a55cea084addb9c3312da6e8c90ff',
    reviewArea: {
      en: 'Trace server metric metadata, time-series groups, source labels, and units.',
      zh: '跟踪服务器指标元数据、时间序列分组、来源标签和单位。',
    },
  },
  {
    source: '../db/src/queries/workflow-info.ts',
    sourceSha256: '713af79b32e320707cd0509739aa2ab189335ba028a8ca6721601914d4e1f929',
    reviewArea: {
      en: 'Availability rows plus workflow runs, changelogs, configurations, and run coverage responses.',
      zh: '可用配置行以及工作流运行、变更记录、配置和运行覆盖响应。',
    },
  },
] as const satisfies readonly ApiContractSourceDigest[];
