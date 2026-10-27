# State Ownership

Reference for agents modifying filter behavior. Explains which context to touch for a given change and how URL params are kept in sync.

## Provider State Map

### GlobalFilterProvider

File: `packages/app/src/providers/GlobalFilterContext.tsx`

`GlobalFilterProvider` owns the state, but it does not publish one response-shaped
context value. Consumers subscribe through five independently memoized domains:
`useGlobalFilterSelection`, `useGlobalFilterActions`, `useGlobalFilterRun`,
`useGlobalFilterAvailability`, and `useGlobalFilterWorkflow`.

Workflow query updates therefore do not notify selection or action consumers. Selection
updates do not notify workflow-only consumers. Components should subscribe only to the
domains they read.

Availability owns explicit settled and error states. Consumers must distinguish an
unresolved request from a settled empty result. Inference fetches are gated on
`sequenceResolved` and render `availabilityError` rather than an indefinite skeleton.

**Why here, not InferenceProvider**: Model, sequence, and precision are cross-tab. EvaluationContext consumes `selectedModel` and `availableModels` directly. If these lived in InferenceProvider, EvaluationProvider would need an indirect coupling or duplicate state.

**"Effective" values and auto-correction**: When a previously valid user selection becomes invalid after a model or sequence change, `effectiveSequence` / `effectivePrecisions` silently switch to the nearest valid option. Components always consume `effectiveSequence` / `effectivePrecisions`, never `selectedSequence` / `selectedPrecisions` directly. This prevents empty-chart states on filter transitions.

---

### InferenceProvider

File: `packages/app/src/components/inference/InferenceContext.tsx`

Depends on `GlobalFilterProvider` through its narrow selection, run, availability,
workflow, and action hooks.

The provider owns inference-specific effects and URL synchronization, then exposes
four independently memoized domains: `useInferenceData`, `useInferenceFilters`,
`useInferenceDisplay`, and `useInferenceActions`. Consumers must subscribe only to the
domains they read. Display changes stay in `useInferenceDisplay`, so a contrast or label
toggle does not notify filter-only or data-only consumers.

`useInferenceFilters` owns inference-only selection state. GPU selections and comparison
dates do not belong in global filter state because evaluation and reliability do not use
them.

**`usePerfRulerStore`** (perf rulers, `i_rulers`)

Completed Perf Rulers on the primary inference chart (`chart-0`) are provider state,
exposed through a dedicated `PerfRulerStoreContext`
(`packages/app/src/components/inference/perf-ruler-store.ts`) rather than the display domain: a
ruler commit would otherwise rerender every display consumer, and harnesses that mount
`InferenceContextsProvider` with static mock values would silently lose ruler
interactivity. The store is scoped to one chart id on purpose. The replay chart
(`replay-chart-0`) draws the same curve classes under the same provider, so a shared
store would render every ruler twice and let the replay's prune pass delete rulers the
main chart still shows. `ScatterGraph` binds when its `chartId` is `chart-0` (ChartDisplay
mounts it as the primary chart) and falls back to component-local state when no matching
store is present; the date-comparison `GPUGraph` keeps its rulers in component-local
state and never reads or writes `i_rulers`.

`ScatterGraph` reads `state`/`setState` from the store, so the existing reducers, refs,
and draw passes are unchanged. The one thing that moved is the axis reset:
`usePerfRulerAxisReset` adjusts state during the chart's render, which is only legal for
the chart's own state, so for persisted rulers the same reset (either axis metric changes
→ rulers, draft, and pending share-link rulers are cleared) runs inside the provider. Its
key, `persistedPerfRulerAxisKey`, describes the graph `ChartDisplay` renders as `chart-0`,
not `graphs[0]`: `graphs` is always `[interactivity, e2e]` and ChartDisplay shows the e2e
graph for every non-interactivity x mode, so the key picks the graph by `selectedXAxisMode`
(as `bestHwTypes` does), uses its `x_scale_field` (which carries the percentile), and folds
the mode itself in because the derived agentic modes override the e2e graph's x field inside
ChartDisplay only. The first chart definition (null → key) and a reload of the same axes
(key → null → key) are not axis changes, so share-link rulers survive the load.

Restoring from a link is a two-phase commit because of a load race. Rulers parsed from
`i_rulers` start as `pending`; data, `i_gpus`, and `?unofficialrun=`
overlays all arrive after the chart's first draw, and the chart prunes any committed
ruler whose curve path is absent from the DOM. The chart therefore commits a pending
ruler only once BOTH of its curve paths exist (hidden-at-opacity-0 counts as present, as
for prune), clamping the iso-x to the pair's overlap through the drawn paths. The commit
runs inside the perf-ruler D3 layer's draw pass (`drawPerfRuler`), not in a React effect:
the chart's first draw happens in a `D3Chart`-local re-render after its container is
measured, which re-renders nothing in `ScatterGraph`, so an effect keyed on the chart's
props could miss the first draw and leave resolvable rulers pending for the session. No
commit happens while the ruler mode is off (the power envelope forces it off on
non-measured axes; the mode-off effect discards pending rulers instead). Rulers whose
curves never appear stay pending — invisible and unserialized — until an axis change,
toggle-off, or clear discards them; this is a deliberate choice over a "data settled"
readiness predicate (fragile across the async order of availability, benchmark, overlay,
and derived-metric fetches). The visible cost is that a link whose curves the recipient's
view lacks lands with the ruler switch on and nothing drawn, and a later legend change on
the same axes can surface the ruler. A non-empty restore switches the ruler mode on for
that chart instance (rulers only render in mode) and fires
`interactivity_perf_ruler_shared_load` once per opened link, with `count` = the number of
rulers the link carried, the first time any of them renders — never per commit batch, so
the event counts links, not curve arrivals. Because the URL is read in a `useState`
initialiser, a retained-provider tab switch onto `/inference?i_rulers=…` does not
re-import the param — the same limitation as the other `i_*` toggles.

**`useInferenceActions`**

All inference commands and setters. The context value and every exposed action keep
stable identities. The provider routes each stable action to the latest implementation,
so new availability or chart data cannot invalidate action-only consumers.

Run filtering remains inference-local. `filteredAvailableRuns` narrows global run
availability to the effective model and precisions. `effectiveSelectedRunId` is
validated within that set but is not written back through the global run action, so a
precision-specific fallback cannot replace the user's global run intent.

---

### EvaluationProvider

File: `packages/app/src/components/evaluation/EvaluationContext.tsx`

Depends on `GlobalFilterProvider` for model and global date intent.

Explicit evaluation date actions synchronize the global requested date only when that
date exists in inference availability. Global changes are reducer inputs rather than a
pair of bidirectional mirroring effects.

**Why a separate `selectedRunDate`**: Eval dates can differ from benchmark dates. EvaluationProvider maintains its own date and syncs it with `GlobalFilterContext` only when the date is present in inference availability, preventing a mismatch from breaking the inference chart.

---

## Comparison Date Mechanics

**Date stamping**: `useChartData` overwrites each row from a comparison query with `{ date: comparisonDates[i], actualDate: r.date }`. The `actualDate` field preserves the real DB date. Without this stamp, `activeDates` (keyed by user-selected date strings like `2025-01-15_h100-sxm`) would never match the rows' `date` field, so the toggle set would have no effect. `?unofficialrun=` rows are not date series, so `activeDates` never hides them; they follow `activeOverlayHwTypes`.

---

## URL State Synchronization

Source files: `packages/app/src/lib/routing/url-state.ts`, `packages/app/src/hooks/useUrlState.ts`, `packages/app/src/hooks/useChartContext.ts` (`useUrlStateSync`).

### Prefix convention

Prefixes name share scopes (see [Architecture](./architecture.md#url-state-persistence)), not owners. `i_seq` and `i_prec` are written by `GlobalFilterProvider` because selection state is owned by `useGlobalFilterSelection`, not InferenceProvider.

### Snapshot, external subscriptions, and writes

`url-state.ts` snapshots known share parameters at module load and removes them from the
visible address bar after hydration while preserving the pathname and hash. Route-owned
entry points pass typed seeds where they render URL-controlled state on the server.

Live address-bar consumers use the shared `useClientSearch` external store. It subscribes
once to `popstate`, `CLIENT_SEARCH_CHANGE_EVENT`, and `CLIENT_PATHNAME_CHANGE_EVENT` through `useSyncExternalStore`;
components do not mirror search strings through independent effects.

`writeUrlParams` batches state serialization for 150 ms. `useUrlStateSync` and explicit
state actions write requested/user state, not derived fallbacks.

The mutable remount snapshot and explicit URL intent are separate. Debounced
filter writes update the remount snapshot so providers preserve current state,
but they do not become explicit share-link choices that block automatic
unofficial-run model selection. A real navigation rebuilds the explicit-intent
set from the destination URL.

### Carrying state across a full-document navigation

The two effects above combine into a trap: filter changes reach only the
in-memory `currentState`, and the address bar is stripped clean, so **the URL of
the `/inference` history entry describes nothing**. Any full-document navigation
away from the chart therefore destroys the state entirely — the module is torn
down, and Back returns to a bare `/inference` that rebuilds from defaults.

The agentic point-detail links (`/inference/agentic/<id>`, rendered by
`tooltipUtils.viewActionsHTML` and `legend-points-table.pointDetailHref`)
are exactly that: plain `<a href>`, deliberately, so browsers can offer
open-in-new-tab. Three helpers in `url-state.ts` bridge the gap:

| Helper                      | Used by                                                      | Why                                                                           |
| --------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `rememberChartStateInUrl()` | the point-click handlers (Scatter / GPU graph, legend table) | `history.replaceState`s the chart state onto the entry Back will return to    |
| `withChartState(href)`      | `agenticDetailHref()`                                        | appends it to the outbound link so the detail page can link back to that view |
| `currentChartSearch()`      | `withChartState()`                                           | resolves the tab through the `/zh` prefix, flushes pending writes, filters    |

The detail page reads the state back through `withChartState` (its own URL was
snapshotted into `currentState` at load, then stripped as usual), which is what
makes its "Inference chart" link land on the chart the reader left rather than
on defaults.

### Re-hydration on client-side navigation

`useUrlState` calls `refreshUrlParamsOnNavigation(pathname)` **during render**,
guarded by a module-level last-pathname so it runs at most once per navigation.
The refresh first flushes pending debounced writes, then applies explicit
destination parameters over that current state. This prevents a rapid filter
change followed by a retained-provider tab switch from replaying the previous
selection.

That ordering also matters because providers read `getUrlParam` in `useState`
initialisers and mount effects, both of which run before any parent's layout
effect. With the hook-level refresh, every provider sees the params of the page
it actually landed on. The once-per-pathname guard keeps a late-mounting
component from replaying a stale URL over subsequent filter changes.

### Share URL construction

`buildShareUrl()` preserves the exact current pathname, locale prefix, dynamic slug, and
hash. It filters parameters using `shareParamScopes` from the canonical dashboard route
registry and carries the canonical `unofficialruns` value from the live URL.

### Parameter registry

`UrlStateKey`, `URL_STATE_KEYS`, and `PARAM_DEFAULTS` in
`packages/app/src/lib/routing/url-state.ts` are the exhaustive parameter source of truth.
Dashboard scope membership is declared by `shareParamScopes` in
`packages/app/src/lib/routing/dashboard-routes.ts`. Tests enforce completeness and route-specific
share behavior, so this document deliberately does not duplicate a manually maintained
parameter table.

One entry needs a note on its encoding: `i_rulers` (inference scope, default `''`) is
`serializePerfRulers` output — `isoX|curveA|curveB` per ruler joined by `;`, where the
curve ids are the rendered roofline path identity classes (`roofline-<hwKey>_<precision>`,
`overlay-roofline-<hwKey>_<precision>_run<N>`, optionally `__<encoded date>`) and the
iso-x is in DATA space rounded to four significant digits. `parsePerfRulers` only accepts
curve ids of that identity-class shape — the shared `roofline-path` marker class or any
other zoom-group node would match many paths and draw a ruler between arbitrary curves.
Only committed rulers are serialized (never the draft or still-pending link rulers), and
the chart prunes them against the rendered curves, so a link written from one data set
degrades to fewer rulers, never to an error. Overlay ids depend on the run order in `unofficialruns`, which the share
link already carries.

`i_pcompare` (inference scope, default `''`) is the power comparison mode, `boundaries`,
`provisioned`, `all` (share links only) or `roles`, owned by `InferenceProvider` as `powerCompare` (display context) with
`setPowerCompare` (actions). It is written as `''` for `none`. It is deliberately NOT cleared
when the metric changes to one without a common axis for the siblings: the chart then draws
the metric alone and the Measured controls show a hint, so the link's intent survives a
detour through another setting. Which comparison rows a reader hid from the legend is
`ScatterGraph` component state (`hiddenPowerVariants`), never shared — see
[PowerX Permanent View](./powerx-permanent-view.md#comparison-series-i_pcompare).

### Staged-result chart links

The staging workflow reads the successfully ingested run's model, workload,
precision and hardware scopes and reports one `chart-links` entry (`label`, `url`)
per visible Pareto line to InferenceX. The links use the same model and hardware
identity helpers as the chart, and combine `i_gpus` with the exact-run
`i_dates=YYYY-MM-DD~rRUN_ID` selection. A date entry alone does not enable GPU
comparison, so it cannot select the staged line.

Run-qualified entries always fetch their exact logical snapshot, even when the
main run picker selected that run. The base query can carry other runs forward
and stamps its points with a plain date; reusing it would lose the run-qualified
series key. This leaves ordinary date comparisons and unofficial-run overlays
unchanged.
