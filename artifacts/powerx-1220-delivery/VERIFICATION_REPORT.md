# Verification report — PowerX #1220 UX packet

## Preflight

- Repo: SemiAnalysisAI/InferenceX-app
- Checked out #1220 head `b07e1c76` on `feat/powerx-article-parity`
- Parent #1167 at `2c160b2e`; GitHub reported CLEAN/MERGEABLE
- Sibling fix branch: `cursor/fix-powerx-1220-share-timeline-tooltip-7b02`

## Reproduction notes

### 1. Run-specific ruler share/reload — REPRODUCED then FIXED

Production/date-comparison path (GPUGraph) enabled Perf Ruler, clicked two curves: URL never gained `i_rulers`; reload dropped rulers. Code cause:

1. GPUGraph used component-local `useState` only (docs previously said this on purpose).
2. Run-qualified curve classes are `roofline-<date>~r<runId>_<hw>_<prec>`; `PERF_RULER_CURVE_ID` was `[\w%.-]+` and dropped `~` on parse.

Fix: bind GPUGraph to `PerfRulerStore` when `chartId === PERSISTED_PERF_RULER_CHART_ID` (same two-phase pending commit as ScatterGraph); expand curve-id alphabet to include `~`.

### 2. Dates-only Timeline — ALREADY CLEAN on head

Component test with `selectedDates: []` and `selectedDateRange: { start, end }` (the `i_dstart`/`i_dend` path) already shows two coloured traces, plain date legend labels (no `#N` run numbers), and solo toggles. No production Timeline code change in this packet; regression coverage added so the path cannot regress silently.

### 3. Mobile tooltip action overflow — FIXED

Pinned tooltips grow with stacked actions (logs / PowerX / power trace). `computeTooltipPosition` clamps top/left but cannot shrink content taller than the viewport. Fix: `tooltipShellStyle` applies `max-height: min(70vh, calc(100dvh - 16px))`, `max-width: min(320px, calc(100vw - 16px))`, `overflow-y: auto` on scatter / overlay / GPUGraph shells. Demo screenshots at 390×844 under `screenshots/`.

## Commands run

```text
bun --env-file=../../.env vitest run \
  src/lib/d3-chart/layers/perf-ruler.test.ts \
  src/components/inference/utils/tooltip-utils.test.ts
# → 173 passed

bunx cypress run --component --spec \
  'cypress/component/gpu-graph.cy.tsx,cypress/component/power-timeline.cy.tsx'
# → 21 passed (17 gpu-graph + 4 power-timeline)
```

New / extended coverage:

- `perf-ruler.test.ts` — round-trip `date~r<runId>` curve ids
- `tooltip-utils.test.ts` — pinned shell carries viewport max-height/width
- `gpu-graph.cy.tsx` — serializes run-qualified rulers via store into `i_rulers` form
- `power-timeline.cy.tsx` — dates-only range comparison legend / labels / solo

## Files changed (expected)

- `packages/app/src/lib/d3-chart/layers/perf-ruler.ts` (+ test)
- `packages/app/src/components/inference/ui/GPUGraph.tsx`
- `packages/app/src/components/inference/perf-ruler-store.ts` (comment)
- `packages/app/src/components/inference/utils/tooltipUtils.ts` (+ test)
- `packages/app/cypress/component/gpu-graph.cy.tsx`
- `packages/app/cypress/component/power-timeline.cy.tsx`
- `docs/state-ownership.md`
- `artifacts/powerx-1220-delivery/**`

## Remaining merge blockers (#1167 → #1220 sequence)

1. Human review + merge of parent **#1167** (`feat/powerx-db-ingest`) — preferred first candidate; this packet does not change it.
2. Land / retarget #1220 after #1167; then run **master-gate** suites (full unit + Chrome/Firefox E2E) that feature-base CI currently skips.
3. Findability / footer / metric-unlock child from `refactor dash | powerx dash` — separate PR on top of #1220; do not block this UX packet on that work.
4. Production DB Timeline telemetry still returns 503 on prod (branch/preview DB has coverage) — data acceptance, not this UX packet.
5. No GPU work; skipped remote checks are not passes.

## AI / env limits

- Vercel preview for #1220 requires SSO; local `DATABASE_READONLY_URL` was not available in this cloud environment (secret requested). Browser proof for Timeline/ruler used Cypress component Electron + a mobile tooltip HTML demo, not a full Next.js + Neon session.
