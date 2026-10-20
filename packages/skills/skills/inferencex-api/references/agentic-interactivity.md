# AgentX P90 interactivity

Read this before an AgentX iso-interactivity comparison, historical trend,
waterfall, or efficiency-gain chart. Use the same statistic for every compared
configuration and date.

- Use **P90 interactivity** for AgentX dashboard comparisons: `1 / P90(full-response ITL in seconds)`, in `tok/s/user`.
- Do not use `median_intvty`, reciprocal P50 latency, `p90_tpot`, or P90 of per-request token rates as substitutes.
- Do not trust raw `p90_intvty`: older artifacts used the opposite percentile order, `P90(1 / ITL)`.
- Prefer `metrics.p90_full_response_itl`. Use legacy `metrics.p90_itl` only when none of the numeric `*_full_response_itl` fields is present. A partial full-response record does not permit a legacy fallback.
- Preserve missing, zero, negative, nonnumeric or non-finite latency as unavailable. Do not insert a zero-rate point, interpolate across missing measurements as if observed, or substitute another percentile.
- Keep single-turn median-interactivity comparisons and the median-only `tco compare` workflow unchanged. An explicitly requested median analysis must be labeled as such and must not be presented as the AgentX dashboard default.

## Use the view API first

Read the deployed OpenAPI contract. For an AgentX inference view, specify
`sequence=agentic-traces&percentile=p90&xmode=interactivity` and retain its resolved
parameters and `xAxis`. Historical views fix the statistic by workload:
`sequence=agentic-traces` uses P90, while single-turn sequences retain the median.
The corrected historical response declares
`interactivity.statistic=p90`, `interactivity.field=p90_intvty`, and
`interactivity.unit=tok/s/user`. Require that metadata before claiming a deployed
history response uses P90. An older deployment without it can still use the median.
The historical route does not accept a `percentile` query parameter.

The interpolation algorithm and selected throughput field must also match.
Keep total and output throughput separate. Do not silently replace the selected
metric, use extrapolation, or infer a causal PR effect from a shared date.

## Calculate from retained raw rows when needed

Use `scripts/agentic-interactivity.mjs` from this skill directory:

```javascript
import { agenticP90Interactivity } from './scripts/agentic-interactivity.mjs';

const rate = agenticP90Interactivity({
  median_intvty: 70,
  p90_full_response_itl: 0.025,
  p90_intvty: 999,
});
// { value: 40, sourceMetric: 'p90_full_response_itl',
//   statistic: 'p90', unit: 'tok/s/user' }
```

Call it only for rows whose `benchmark_type` is `agentic_traces`. Preserve each
row's source identity and the returned `sourceMetric`. Report unavailable-row
counts. Label chart targets and result tables “P90 interactivity (tok/s/user)”;
40 tok/s/user in the example is not interchangeable with its 70 tok/s/user median.

E2E Normalized Interactivity is a separate metric:
`1 / P90(E2EL / OSL)`. Use its documented derived-metric endpoint rather than
substituting it for full-response ITL interactivity. Medians in AgentX source
diagnostic charts are also separate and do not change this operating-point rule.
