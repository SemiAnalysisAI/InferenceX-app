# PowerX #1220 UX fix packet

Local reviewable packet for the three confirmed UX defects on InferenceX-app PR #1220.

## SHAs

| Ref                                     | SHA                                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Local base (#1220 head at branch point) | `b07e1c76d6d2285a27e75bdda65a2d6276a7d1a2`                                                         |
| Parent #1167 (`feat/powerx-db-ingest`)  | `2c160b2e2238f926adeb3299754c714a2de2ceac`                                                         |
| Fix branch head                         | `14b5bec620c643f233b560617ba576b9e57d6f3d` on `cursor/fix-powerx-1220-share-timeline-tooltip-7b02` |
| Draft PR                                | https://github.com/SemiAnalysisAI/InferenceX-app/pull/1229 (base #1220)                            |

Live API at start: #1220 `mergeable=true` / `mergeStateStatus=CLEAN` against #1167 — **no conflict work invented**.

## Defect status

| Defect                              | Pre-fix on head                                                                                                                                        | Fix in this packet                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| (1) Run-specific ruler share/reload | **Reproduced** — GPUGraph kept local ruler state; `PERF_RULER_CURVE_ID` rejected `~` in `date~r<runId>` curve ids, so `i_rulers` never round-tripped   | Wire GPUGraph to `PerfRulerStore` when `chartId === chart-0`; allow `~` in curve-id alphabet |
| (2) Dates-only comparison Timeline  | **Already clean on head** after `12de0af3` — range-only (`i_dstart`/`i_dend`, empty `i_dates`) already shares colours / per-date legend / solo toggles | Regression component test only (`follows dates-only range comparison`)                       |
| (3) Mobile tooltip action overflow  | **Confirmed by code + demo** — shell had no max-height; taller-than-viewport pinned tooltips overflow despite position clamp                           | Shared `tooltipShellStyle` with viewport-capped max-height/width + scroll                    |

## Findability boundary

**Out of scope for this branch.** Footer / findability / metric-unlock work is owned by `refactor dash | powerx dash` (child of #1220). This packet does not touch nav, footer, metric unlock, or publish gates. Do not merge those changes into this branch.

## Evidence

- `VERIFICATION_REPORT.md` — commands, results, remaining merge blockers
- `screenshots/mobile-tooltip-before-scroll.webp` — 390×844 pinned shell before scroll
- `screenshots/mobile-tooltip-after-scroll.webp` — same shell after scroll; all actions reachable

## Reproduce tests

```bash
export PATH="$HOME/.bun/bin:$PATH"
cd packages/app
bun --env-file=../../.env vitest run \
  src/lib/d3-chart/layers/perf-ruler.test.ts \
  src/components/inference/utils/tooltip-utils.test.ts
bunx cypress run --component --spec \
  'cypress/component/gpu-graph.cy.tsx,cypress/component/power-timeline.cy.tsx'
```
