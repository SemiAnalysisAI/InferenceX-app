# TCO feed: modeled GPU-rate cost at the same interactivity

Use `inferencex tco compare` for a fixed single-turn workload and a common median
interactivity target. It applies explicit user-supplied USD/GPU-hour rates to the
public feed's output throughput. The result is a rate estimate per million output
tokens **on the API's reported throughput basis**. Whole-deployment rental cost
requires verifying which GPUs that throughput divides by; ownership TCO also needs other costs.

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

For evidence provenance, report the bundle's `manifest.json`, request URLs,
recorded attempts, and retained response paths/hashes. Derive a bundle attempt
count from `requests[].attempts`; it describes that bundle, not every request in
the agent session. Supplemental discovery reads are outside this manifest. Keep
their captures separately in the project, and identify any missing capture if
the report relies on it. Preserve each raw capture's JSON sidecar. An optional
combined index must serialize those objects as a JSON array; concatenating JSON
objects does not produce a valid JSON manifest. A successful bundle verification
does not verify supplemental reads.

## Establish the comparison

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

## When hourly prices are missing

Keep the missing rates symbolic. Use the [bounded raw-API capture recipe](public-api-examples.md)
to retain the complete `tco-feed?view=points&format=json` response for the requested
model, workloads, median target (`tiers`), and optional date. Report positive,
in-range throughput and evidence dates separately for each hardware/workload.
For two such points with throughputs `t_A` and `t_B`, equal modeled cost occurs at
`price_A / price_B = t_A / t_B` on the API-reported throughput basis; A's rate
estimate is lower only if the user's rate ratio is below that boundary. A
whole-deployment comparison additionally needs the denominator evidence below.
Missing, clamped, and unreachable points have no cost boundary.
If reporting sensitivity with supplied prices, equality at the boundary means a
tie; crossing it changes the cheaper estimate. Keep that distinction when rounding
the saved boundary for prose.

Finish with the symbolic boundary and ask for the missing USD/GPU-hour rates and
billing scope. The cheaper hardware remains unresolved. Website defaults, typical
market spreads, and invented `$1` rates are not user-supplied prices; pass
`--gpu-hourly-prices` to the formal comparison once those inputs are supplied.
Keep that unresolved conclusion throughout the final answer and saved report.
Saying "at current market spreads it is not close" or naming a likely winner
still assumes prices, even when followed by a request for the user's rates.
Give only conditional comparisons on the reported throughput basis; the feed
supplies throughput, not rental-price evidence.
Keep `evidence_date` knot dates distinct from `latest_date` for the whole frontier.
If reporting an elapsed gap, compute `(Date.parse(to) - Date.parse(from)) / 86400000`
from the stated endpoints and save that scalar before quoting it in prose. Otherwise
report the date endpoints without inventing a gap.

## Check a P99 ITL constraint

Use the raw benchmark observation's `metrics.p99_itl`, measured in **seconds**.
Convert it to milliseconds with `p99_itl * 1000`. `p99_tpot` measures a different
statistic (per-request time per output token). The reciprocal `1000 / p99_intvty`
is not P99 ITL. A median frontier target cannot certify a tail SLA.

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
Use only the user's requested predicate for that classification. An unusual
`p99.9_itl`, TPOT/ITL ratio, framework, or concurrency can warrant a separate
diagnostic caveat, but does not turn a finite `p99_itl < 0.020` into a failure.
Retain the passing row and its cost on the API-reported basis. Label any optional
screen separately, obtain the user's constraint before applying it, and avoid
inferring burst delivery from aggregate percentiles alone.
For a cost comparison under this constraint, first establish eligible observations
and comparable throughput scope; the median-only TCO feed does not do that filtering.

## Run the comparison

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

A price is per GPU per billed hour, not per server or cluster. Normalize a server
quote only when the GPU count and billing scope are known and show that conversion.

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

## Check coverage and evidence

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
dates across GPUs. The metadata records the requested model and returned
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

## Deliver or stop

`result.json` contains assumptions, selected rows, coverage, and a source reference.
`manifest.json` records the exact query URL, retrieval timestamp, HTTP status,
attempt ledger, decoded response path, byte count, and SHA-256. The complete body
is retained under `responses/`; its hash covers bytes after Fetch decodes HTTP
compression. Save the whole bundle. A URL or as-of date alone does not freeze data.

The command defaults to a 30-second deadline and 4 MiB response limit. Redirects, HTTP
errors, invalid JSON/UTF-8, mismatched scope, inconsistent evidence, numeric
overflow, and output errors fail with a nonzero exit. A partial-coverage response
commits a valid bundle with explicit null costs and is not retried; an unmet
requested coverage policy exits 3. Transient request failures use the bounded
retry policy in the [CLI contract](cli.md).

`--output-dir` creates a new evidence directory and refuses an existing one.
The final manifest commits the bundle; stdout contains a command summary, not
the result body. Write reports at sibling paths and finish with `inferencex verify`
on the bundle. See the [CLI contract](cli.md) for incomplete writes and failures
after commit.

Deliver the artifact with the model keys, workload/target, user rates, per-row
evidence dates, coverage, and configuration limits. State that no new benchmarks
were run. On failure, report the error and retain the earlier artifact; on missing
evidence, stop at the documented gap rather than manufacturing a comparison.
