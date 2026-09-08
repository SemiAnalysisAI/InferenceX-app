# Compare modeled GPU-rate costs

Use explicit user-supplied USD/GPU-hour rates to estimate cost per million output
tokens **on the API's reported throughput basis**. A supplied `/GPU-hour` rate
establishes its billing unit; keep its source with the assumptions. Normalize a
server quote only when its GPU count and billing scope are known, and show the
conversion. Unknown throughput denominators or pool membership limit a
whole-deployment cost conclusion; they do not make an explicit per-GPU rate unknown.
Ownership TCO also needs costs outside that rate.

Choose the measurement path from the user's constraint:

- **Fixed median output tok/s/user:** use the [median feed comparison](#median-feed-comparison).
- **P99 ITL:** use [raw observation eligibility](#check-a-p99-itl-constraint), then
  compare costs for eligible observations on a comparable throughput basis.
- **Missing hourly rates in either path:** use the [conditional price comparison](#when-hourly-prices-are-missing).

## Median feed comparison

When the user supplies the model, workload, target, and exact hardware keys with
prices, run the comparison directly. `--model` accepts a DB model key or display name;
model discovery, an OpenAPI download, and a preliminary feed download are not
prerequisites for this formal command.

```bash
mkdir -p evidence
node .agents/skills/inferencex-api/scripts/inferencex.mjs tco compare \
  --model DeepSeek-V4-Pro --workloads 1024x1024 --target 50 \
  --gpu-hourly-prices b200=3.6,mi355x=1.8 --output-dir evidence/tco \
  --require-hardware b200 --require-hardware mi355x
```

These prices are illustrative inputs. Missing, clamped, unreachable, and zero
throughput rows keep null modeled costs. Without a predicate they are valid scoped
output; a required hardware miss commits the bundle and exits 3. See the
[CLI contract](cli.md).

### Select the median target

1. Obtain the user's model, input/output token lengths, target, and positive
   per-GPU hourly prices. Keep the supplied rate's source and billing scope in the
   accompanying explanation. For missing prices, use the branch below. If the
   model is unresolved, consult the
   current [`/api/v1/tco-feed` OpenAPI operation](https://inferencex.semianalysis.com/api/openapi.json)
   using the bounded raw-API capture recipe before making a raw data request.
2. Express the target in **median output tok/s/user**. The feed prefers stored
   `median_intvty`, using `1 / median_itl` only when that field is unavailable.
   It does not guarantee the two stored statistics are reciprocal. For an
   inter-token latency constraint, obtain the actual latency metric: use the P99
   recipe below for a P99 ITL requirement. TTFT, total request latency, and other
   percentiles require their own metrics. Agentic Traces require a
   different read; this feed covers fixed single-turn workloads.
3. Read the complete JSON `view=points&format=json` response at that model,
   workload list, target (`tiers`), and optional date. The bundled helper performs
   this read; when the user already supplies exact hardware keys, no preliminary
   feed download is needed. Use exact, case-sensitive
   `rows[].hardware` keys for the prices. Discover keys from this response, not
   display labels or benchmark-route aliases. At most eight distinct positive
   `<isl>x<osl>` workloads and one target in `(0, 10000]` are accepted by the helper.
4. Use one scope for every GPU. `--date` is an inclusive as-of cutoff; source
   evidence may be older. Omission selects latest available data. Keep workloads
   separate: this helper produces no workload blend, weighted score, or ranking.

### Cost on the reported throughput basis

Use `inferencex tco compare --output-dir` as shown above. Prices and cutoffs are
inputs, not current price quotes; use the user's assumptions and exact returned
hardware keys.

Only priced hardware is selected for costing. The complete source response stays
in the export so missing keys can be checked against returned hardware. Price
selection and point availability are independent: unpriced hardware can still be
unreachable at the requested target. Before describing excluded hardware, inspect
its retained source point for each workload and preserve `boundary`, throughput,
and `evidence_date`. The selected rows' complete coverage says nothing about those
excluded points. If they were not checked, report only that they were not priced.

The helper makes one HTTPS GET to the public points feed. It uses the server's
interpolation, then computes:

```text
USD per million output tokens =
  USD/GPU-hour × 1,000,000 / (output tokens/second/GPU × 3,600)
```

The feed preserves the producer's output-throughput denominator. Fixed-sequence
results can divide output throughput by decode GPUs and total throughput by
prefill plus decode GPUs; AgentX uses a different path. Ratios between fields
alone establish neither physical GPU membership nor a universal `2×` correction.
Keep the rate estimate on the reported basis. A whole-deployment conversion or
fleet winner requires the exact producer semantics, verified pool membership,
and rates for those pools; otherwise that conclusion remains unresolved.

For example, a supplied rate of `$3.60/GPU-hour` and API throughput of
`1,000 output tok/s/GPU` give `$1.00/M output tokens`. This assumes the reported
throughput is sustained throughout the billed hours (`assumed_throughput_fraction=1`).
It is not a measured GPU-utilization assertion. Costs outside the supplied hourly
rate—such as idle time, storage, networking, staffing, or ownership expenses—are
outside this calculation. The denominator is output tokens; there is no token
revenue, input-token value weighting, or measured power/energy calculation.

If reporting sensitivity with supplied prices, equal modeled cost occurs at
`price_A / price_B = throughput_A / throughput_B` for comparable points. Equality
is a tie; crossing that boundary changes the cheaper estimate. Preserve that
distinction when rounding the saved boundary for prose.

### Coverage and evidence

Read every selected row before comparing costs. Each priced hardware/workload
pair appears once, including missing pairs:

| `status`          | Interpretation                                                                                                                                       | Modeled cost |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `available`       | Positive throughput at an in-range target. `point.is_interpolated` distinguishes an estimate between knots (`true`) from an observed knot (`false`). | Calculated   |
| `clamped_low`     | Target is below the measured frontier; the feed supplies its lowest-interactivity knot.                                                              | `null`       |
| `unreachable`     | Target exceeds this returned frontier's maximum; feed throughput is zero.                                                                            | `null`       |
| `zero_throughput` | In-range feed throughput is zero, including possible rounding to zero.                                                                               | `null`       |
| `missing_point`   | This response contains no point for that exact hardware/workload.                                                                                    | `null`       |

`coverage.status=complete` means all selected pairs have calculable in-range costs.
It does not establish matched serving configurations, quality, or production SLA
compliance. A gap is unavailable evidence, not zero cost or a proven hardware
capability limit. Preserve gaps; avoid silently changing the target, dates, prices,
or workloads to obtain a complete comparison.

Retain `point.evidence_date` for the knot(s) backing the target, plus
`oldest_frontier_date` and `latest_date` for the whole frontier. Report differing
dates across GPUs. If reporting a gap, compute elapsed days from those endpoints
in the saved calculation. The metadata records the requested model and returned
`db_model_keys`. Even a single returned raw key establishes only the API's model
bucket, not identical checkpoint weights or an exact model revision across the
frontier's observations. Do not turn a one-key response into a matched-release claim.

The feed pools frameworks, precisions, speculative methods, and deployment
configurations into a hardware frontier. It exposes no observation IDs or complete
configuration identity, and returns throughput rounded to three decimal places.
Describe a comparison as **frontier rate estimates on the API-reported throughput basis**.
A surprising hardware ranking alone cannot identify why the frontiers differ.
If the user requires matched configuration, topology, precision, run provenance,
or quality, stop this comparison and gather the necessary benchmark evidence.

## When hourly prices are missing

Use this branch only for missing rates or unspecified billing units. Keep those
inputs symbolic and request what is missing. For a median-target task, use the
[installed response capture helper](public-api-examples.md) to retain the complete
`tco-feed?view=points&format=json` response for the requested model, workloads,
median target (`tiers`), and optional date. For a P99 task, use the eligible,
comparable raw observations from the [P99 recipe](#check-a-p99-itl-constraint).
Keep each hardware/workload's positive throughput and evidence dates separate;
median-feed points must also be in range. Missing, clamped, and unreachable points
have no cost boundary.

Capture the current OpenAPI operation and then the exact requested points feed.
The example paths below use the Codex installation; Claude Code uses `.claude`.
Set the model, workloads, target and optional date from the user's request.

```bash
node --input-type=module <<'JS'
import { createResponseCapture } from './.agents/skills/inferencex-api/scripts/capture-response.mjs';
const { read, requests } = createResponseCapture();
const spec = await read('/api/openapi.json');
if (!spec.paths?.['/api/v1/tco-feed']?.get) throw new Error('TCO feed GET is not documented');
const query = new URLSearchParams({ model: 'DeepSeek-V4-Pro', workloads: '8192x1024',
  tiers: '50', view: 'points', format: 'json' });
await read(`/api/v1/tco-feed?${query}`);
console.log(JSON.stringify({ requests, points_body: requests.at(-1).body_path }, null, 2));
JS
```

Run the installed offline summary helper on `points_body`, retaining the same
selectors (including `--date` if the captured query used one). Use a new report path:

```bash
node .agents/skills/inferencex-api/scripts/tco-summary.mjs \
  --input api-evidence-EXAMPLE/2.body --model DeepSeek-V4-Pro \
  --workloads 8192x1024 --target 50 --hardware-a b200 --hardware-b mi355x \
  --report tco-conditional.md
```

Its JSON contains `comparisons`, `source`, `price_status`, `cost_winner`,
`conclusion` and `report_markdown`. It uses the formal TCO feed validator and
computes each workload separately. Keep its generated conditional conclusion in
the final reply. This is an offline analysis of a raw capture, not a formal bundle
accepted by `inferencex verify`; retain the capture sidecars beside its source body.

For two such points with throughputs `t_A` and `t_B`, equal modeled cost occurs at
`price_A / price_B = t_A / t_B` on the API-reported throughput basis. A's estimate
is lower only below that boundary; equality is a tie. A whole-deployment comparison
still requires the denominator and pool evidence described above.

Finish with the symbolic boundary and the missing USD/GPU-hour rates or billing
scope. The cheaper hardware remains unresolved until those inputs are supplied.
Website defaults, market spreads, and invented `$1` rates are not user-supplied
prices. Keep comparisons conditional throughout the report and final answer;
naming a likely winner still assumes prices. Once rates are supplied, apply them
in the selected measurement path; the median path accepts `--gpu-hourly-prices`.

## Check a P99 ITL constraint

Use the raw benchmark observation's `metrics.p99_itl`, measured in **seconds**.
Convert it to milliseconds with `p99_itl * 1000`. `p99_tpot` measures a different
statistic (per-request time per output token). The reciprocal `1000 / p99_intvty`
is not P99 ITL. A median frontier target cannot certify a tail SLA.
Use only the user's requested predicate for classification and costing. Retain a
finite `p99_itl < 0.020` pass and its cost on the API-reported basis. If another
statistic helps explain a limitation, report its recorded value separately.
Different percentiles can differ greatly without internal inconsistency; TPOT and
ITL also measure different statistics. Aggregate ratios alone establish neither
invalid data nor a delivery pattern. Additional screening thresholds require the
user's criterion; do not invent a preferred planning subset from those ratios.

Capture the complete benchmark/history response using the bounded raw-API recipe,
then set the workload scope to the user's request. Obtain `scope.model` from
`inferencex discover models` or the captured rows' actual `model` value; `dsv4`
below is an example raw key, not a display-name conversion rule. This offline
example keeps every selected observation and checks **strictly below 20 ms**
(`p99_itl < 0.020` seconds). Missing, nonnumeric, nonfinite, and negative values
remain `unknown`; preserve the source capture alongside this derived report.
Raw request concurrency is `conc`. The recipe maps it to `concurrency`, retaining
the raw field and using `null` for missing or invalid values.

```bash
node --input-type=module - evidence/benchmark-history.body <<'JS'
import { readFileSync } from 'node:fs';
const scope = { model: 'dsv4', benchmark_type: 'single_turn', isl: 8192, osl: 1024 };
const source_path = process.argv[2];
const rows = JSON.parse(readFileSync(source_path, 'utf8'));
if (!Array.isArray(rows)) throw new Error('Expected a captured benchmark row array');
const selected = rows.filter((row) =>
  Object.entries(scope).every(([key, value]) => row[key] === value));
const checked = selected.map((row) => {
  const seconds = row.metrics?.p99_itl;
  const known = Number.isFinite(seconds) && seconds >= 0;
  return {
    ...row,
    concurrency: Number.isSafeInteger(row.conc) && row.conc > 0 ? row.conc : null,
    p99_itl_ms: known ? seconds * 1000 : null,
    p99_itl_under_20ms: known ? (seconds < 0.020 ? 'pass' : 'fail') : 'unknown',
  };
});
console.log(JSON.stringify({ source_path, scope, matching_rows: checked.length, rows: checked }, null, 2));
JS
```

Report passing, failing, and unknown **result IDs** with their configuration,
measurement date, and source. A sampled row's failure says nothing about unexamined
configurations; a recorded pass is scoped to that observation, not a production SLA.
For costs under this constraint, apply the [rate formula and denominator limits](#cost-on-the-reported-throughput-basis)
to eligible observations with comparable throughput scope. The median-only feed
does not perform P99 filtering.

## Deliver or stop

Follow the shared [delivery rules](../SKILL.md#deliver-the-requested-result) and
[CLI contract](cli.md) for evidence retention, output handling, and final verification.
Keep `result.json` assumptions, selected rows, coverage, and source references
with the complete response bundle. Its URL or as-of date alone does not freeze data.

Derive bundle attempt counts from `requests[].attempts`; they cover that bundle,
not the entire agent session. Keep supplemental discovery captures and JSON
sidecars separately, and identify any missing capture the report relies on.
A combined index must be a JSON array rather than concatenated objects. Bundle
verification does not verify those supplemental reads.

The median command has a 30-second deadline and 4 MiB response limit. Partial
coverage commits a valid bundle with null costs and is not retried; an unmet
coverage policy exits 3. Transient failures follow the bounded CLI retry policy.
Deliver the requested model/workload scope, rates, evidence dates, coverage and
configuration limits. State that no new benchmarks ran. Retain failed attempts
and report missing evidence instead of manufacturing a comparison.
