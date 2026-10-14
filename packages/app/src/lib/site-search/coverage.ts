/**
 * App routes the build-time site search index deliberately leaves out, with
 * the reason. Patterns use App Router syntax without route groups; each entry
 * also covers its `/zh` mirror. `build-index.server.test.ts` fails when a new
 * `page.tsx` is neither produced by the index nor listed here.
 *
 * Keep docs/site-search.md in sync with this list.
 */
export const NOT_INDEXED_ROUTES: readonly { pattern: string; reason: string }[] = [
  // Live data rendered per request from the benchmark database.
  {
    pattern: '/compare/[slug]',
    reason: 'Live pairwise comparison rendered per request from the database.',
  },
  { pattern: '/compare/[slug]/[scenario]', reason: 'Live comparison scenario (per request).' },
  { pattern: '/compare-per-dollar/[slug]', reason: 'Live comparison (per request).' },
  { pattern: '/compare-per-dollar/[slug]/[scenario]', reason: 'Live comparison (per request).' },
  { pattern: '/compare-precision/[slug]', reason: 'Live comparison (per request).' },
  { pattern: '/compare-precision/[slug]/[scenario]', reason: 'Live comparison (per request).' },
  { pattern: '/compare-spec-decode/[slug]', reason: 'Live comparison (per request).' },
  { pattern: '/compare-spec-decode/[slug]/[scenario]', reason: 'Live comparison (per request).' },
  {
    pattern: '/run/[slug]',
    reason: 'Which model/GPU pairs exist depends on database results; rendered per request.',
  },
  { pattern: '/agentx/[slug]', reason: 'AgentX dataset pages listed from the database.' },
  {
    pattern: '/agentx/[slug]/conversations/[convId]',
    reason: 'Per-trace conversation replay from the database.',
  },
  { pattern: '/inference/agentic/[id]', reason: 'Per-run telemetry detail from the database.' },
  { pattern: '/inference/logs/[id]', reason: 'Per-run server logs.' },
  // Filtered or parameterized views of a tab that is indexed.
  { pattern: '/calculator/[model]', reason: 'Model filter of the indexed /calculator tab.' },
  { pattern: '/historical/[model]', reason: 'Model filter of the indexed /historical tab.' },
  {
    pattern: '/profit-estimator/[model]',
    reason: 'Model filter of the profit estimator tab.',
  },
  {
    pattern: '/profit-estimator/[model]/[...filters]',
    reason: 'Filtered profit estimator view.',
  },
  {
    pattern: '/profit-estimator-per-gigawatt/[model]',
    reason: 'Model filter of the per-gigawatt estimator tab.',
  },
  {
    pattern: '/profit-estimator-per-gigawatt/[model]/[...filters]',
    reason: 'Filtered per-gigawatt estimator view.',
  },
  // Not part of public navigation.
  {
    pattern: '/agentic-workload-explorer',
    reason: 'Feature-gated tab backed by a separate ProxyTrace database.',
  },
  {
    pattern: '/agentic-workload-explorer/[...section]',
    reason: 'Feature-gated explorer sections.',
  },
  { pattern: '/video', reason: 'Feature-gated tab.' },
  { pattern: '/operatorx', reason: 'Feature-gated tab.' },
  { pattern: '/collectivex', reason: 'Feature-gated tab.' },
  { pattern: '/ai-chart', reason: 'Feature-gated tab.' },
  { pattern: '/gpu-metrics', reason: 'Feature-gated tab.' },
  { pattern: '/current-inferencex-image', reason: 'Feature-gated tab.' },
  { pattern: '/feedback', reason: 'Feature-gated feedback form.' },
  { pattern: '/embed/model/[slug]', reason: 'Chart embeds for third-party iframes.' },
  { pattern: '/ubenchx', reason: 'Redirects to /ubenchx/mem-bw, which is indexed.' },
  { pattern: '/zh/[...notFound]', reason: 'Catch-all 404 for unknown /zh paths.' },
];
