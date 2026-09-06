# TCO feed: modeled GPU-rate cost at the same interactivity

Use `scripts/compare-tco.mjs` for a fixed single-turn workload and a common median
interactivity target. It applies explicit user-supplied USD/GPU-hour rates to the
public feed's output throughput. The result is a GPU rental/rate cost estimate per
million output tokens. A full ownership TCO needs additional cost assumptions.

## Establish the comparison

1. Read the current [`/api/v1/tco-feed` OpenAPI operation](https://inferencex.semianalysis.com/api/openapi.json)
   for supported model keys/display names. Obtain the user's model, input/output
   token lengths, target, and positive per-GPU hourly prices. Keep the supplied rate's source
   and billing scope in the accompanying explanation. Ask for missing prices;
   never substitute website defaults or guessed market prices.
2. Express the target in **median output tok/s/user**. The feed prefers stored
   `median_intvty`, using `1 / median_itl` only when that field is unavailable.
   It does not guarantee the two stored statistics are reciprocal. For an
   inter-token latency constraint, first obtain an explicit interactivity target
   or verify the underlying statistic; `1000 / milliseconds` alone does not prove
   the feed meets that latency requirement. TTFT, total request latency, and
   P90/P99 latency also require different evidence. Agentic Traces require a
   different read; this feed covers fixed single-turn workloads.
3. Read the complete JSON `view=points&format=json` response at that model,
   workload list, target (`tiers`), and optional date. Use exact, case-sensitive
   `rows[].hardware` keys for the prices. Discover keys from this response, not
   display labels or benchmark-route aliases. At most eight distinct positive
   `<isl>x<osl>` workloads and one target in `(0, 10000]` are accepted by the helper.
4. Use one scope for every GPU. `--date` is an inclusive as-of cutoff; source
   evidence may be older. Omission selects latest available data. Keep workloads
   separate: this helper produces no workload blend, weighted score, or ranking.

## Run the installed helper

Resolve the script relative to the loaded `SKILL.md`. Codex normally installs at
`.agents/skills/inferencex-api`, Claude Code at `.claude/skills/inferencex-api`.
Use the actual location for a custom installation and Node 24 or later.

The prices and cutoff below are **illustrative inputs**, not current price quotes.
Replace them with the user's explicit assumptions and discovered hardware keys.

```bash
INFERENCEX_SKILL_DIR='.agents/skills/inferencex-api'
node "$INFERENCEX_SKILL_DIR/scripts/compare-tco.mjs" \
  --model dsv4 --workloads 1024x1024,8192x1024 --target 50 \
  --gpu-hourly-prices b200=3.60,mi355x=1.80 \
  --date 2026-09-06 --output tco-comparison.json
```

Only priced hardware is selected for costing. The complete source response stays
in the export so missing keys can be checked against returned hardware. A price is
per GPU per billed hour, not per server or cluster. Normalize a server quote only
when the GPU count and billing scope are known and show that conversion.

The helper makes one HTTPS GET to the public points feed. It uses the server's
interpolation, then computes:

```text
USD per million output tokens =
  USD/GPU-hour × 1,000,000 / (output tokens/second/GPU × 3,600)
```

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
`db_model_keys`; a display bucket spanning multiple keys does not prove a matched
exact model release.

The feed pools frameworks, precisions, speculative methods, and deployment
configurations into a hardware frontier. It exposes no observation IDs or complete
configuration identity, and returns throughput rounded to three decimal places.
Describe a comparison as **frontier estimates under the stated GPU rates**.
If the user requires matched configuration, topology, precision, run provenance,
or quality, stop this comparison and gather the necessary benchmark evidence.

## Deliver or stop

The JSON contains assumptions, selected rows, coverage, and `source`: the exact
query URL, retrieval timestamp, HTTP status, complete UTF-8 response body, byte
count, and SHA-256. The hash covers the bytes after Fetch decodes HTTP compression;
encoding the retained `source.body` as UTF-8 reproduces them. Save the whole export.
A URL or as-of date alone does not freeze live data.

The request has a 30-second deadline and 4 MiB response limit. Redirects, HTTP
errors, invalid JSON/UTF-8, mismatched scope, inconsistent evidence, numeric
overflow, and output errors fail with a nonzero exit. A partial-coverage response
is a successful export with explicit null costs. It needs no automatic retry.

Use `--output` for a file: validation completes before an atomic replacement,
and failed reads/writes preserve the existing file. Without it, JSON goes to
stdout and errors to stderr. Shell redirection can truncate a file before the
helper starts; a closed stdout pipe fails and any partial stream is unusable.

Deliver the artifact with the model keys, workload/target, user rates, per-row
evidence dates, coverage, and configuration limits. State that no new benchmarks
were run. On failure, report the error and retain the earlier artifact; on missing
evidence, stop at the documented gap rather than manufacturing a comparison.
