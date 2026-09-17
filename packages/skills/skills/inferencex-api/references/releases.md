# Investigate observed framework changes

Use this workflow for a vLLM or SGLang before/after question about existing
InferenceX observations. It compares an explicit display model, hardware,
fixed ISL/OSL workload, performance metric, dates, and producer image/run identities.
The result is a descriptive comparison with coverage and confounders. It runs
no benchmark, bisect, monitor, or statistical regression test.

For a replayable contract 1 comparison, use the versioned entry and require at
least one eligible pair when CI needs positive coverage:

```bash
mkdir -p evidence
node .agents/skills/inferencex-api/scripts/inferencex.mjs releases compare \
  --model GLM-5 --hardware h200_sxm --framework vllm --isl 8192 --osl 1024 \
  --metric median_ttft --before-date 2026-09-01 --after-date 2026-09-02 \
  --before-image vllm:before --after-image vllm:after \
  --output-dir evidence/releases --min-comparable-pairs 1
```

No comparable pair is valid scoped output without the predicate. With it, the
bundle is retained and the command exits 3. See the [CLI contract](cli.md).

Supported metrics, when recorded, are `median`, `p75`, `p90`, `p95`, `p99`, or
`p99.9` statistics of `ttft`, `tpot`, `itl`, `e2el`, `intvty`, or `qps`, plus
`mean_qps`, `std_qps`,
`tput_per_gpu`, `output_tput_per_gpu`, `input_tput_per_gpu`, `total_tput_tps`,
`output_tput_tps`, and `input_tput_tps`. History removes `mean` and `std` statistics
of `ttft`, `tpot`, `itl`, `e2el`, and `intvty`, so the helper rejects those keys
before HTTP. Other supported metrics can still be absent from a selected row;
report that coverage rather than treating absence as a zero or an observed change.
Power, energy, telemetry, audit fields, and unrecognized metrics are also rejected
before HTTP. Ordinary history may retain
legacy or invalid power values whose semantics are not comparable. Use the
[PowerX cookbook](powerx.md) and its strictV2 eligibility checks for those tasks;
retaining such fields in raw evidence does not qualify them for comparison.

## Choose the direct comparison or discover a missing scope

When the request already supplies the exact display model, hardware, framework,
ISL/OSL, metric, before/after dates, and an exact image or run URL for each side,
run the formal comparison directly. It performs the one bounded logical history
read needed for selection and records the accepted complete response and all
attempts in its bundle.

Use supplementary public reads only for the specific identity or context that is
missing:

1. Read the live [API reference](https://inferencex.semianalysis.com/api) or
   [OpenAPI document](https://inferencex.semianalysis.com/api/openapi.json) when
   an endpoint parameter or display-model name needs verification.
2. Read `/api/v1/reliability` when the task is to discover hardware/date coverage.
   Its rows contain `hardware`, `date`, `n_success`, and `total` for latest
   attempts. It has no model, framework, image, or release dimension. Several
   rows can share a hardware/date; counts describe their reported scope, not a
   release-specific failure rate.
3. Read `/api/v1/framework-releases` when current vLLM/SGLang stable-tag context is
   requested. Values are the latest usable stable GitHub release tags or null,
   cached by the service. This is **not a historical release registry**: it
   supplies no publication timeline or mapping from benchmark images to releases.
   Keep a tag's retrieval time and verify any historical tag/commit claim
   independently with its upstream release and producer evidence.
4. Use a raw history read only to discover an unavailable date, image, run URL, or
   raw-model selector. The scope is
   `/api/v1/benchmarks/history?model=<display-name>&isl=<tokens>&osl=<tokens>`.
   It accepts neither server-side date nor hardware/framework filters and returns
   the model/workload history across hardware and frameworks. Omit
   `view=calculator` to retain the metrics and provenance available from history.

Keep supplementary captures used by the analysis separately from the formal bundle,
using the [shared evidence rules](../SKILL.md#deliver-the-requested-result).
The formal manifest's attempts and completeness cover that command, not other
session requests. If discovery still leaves a required identity unavailable,
report what is missing instead of choosing a nearby date, model, image,
concurrency, or framework variant.

`--framework vllm` and `--framework sglang` select those exact returned keys.
They do not fold in `dynamo-sglang`, `mori-sglang`, or other wrappers. A display
model can contain several raw model keys; `--raw-model` narrows to an exact key.
Do not scan every model or invent release dates to fill an empty scope.

## Run the comparison

Use `inferencex releases compare --output-dir` as shown above. Select each side by
an exact image, an exact run URL, or both.

These selectors were observed in public history; refresh discovery before
reusing them. The image tags are exact returned strings, not a verified assertion
about the framework commits inside those images. Each side requires an exact
image, an exact run URL, or both. When both are supplied, both must match.
Run URLs distinguish `/attempts/<n>`; a bare run URL is not expanded to an
attempt. Internal `workflow_run_id` and `curve_workflow_run_id` values are never
interpreted as GitHub run IDs.

The helper makes one history GET. All date, hardware, framework, raw model,
image, and run selections are local and are recorded separately from its exact
query URL. Dates refer to `date`, the original observation, rather than the
possibly newer `curve_date`. The history reader exposes logical snapshots from
latest attempts; it is not a complete archive of all attempts.

## Read matching and missingness

The bundle preserves the complete decoded history response in `responses/*.body`,
including excluded scopes and dates. The result's `sources[]` entry links the
comparison to its manifest response ID. `selection`
preserves selected rows and identity exclusions; source nulls, zeroes, false
values, unknown fields, and exact string IDs remain intact. Numeric IDs must be
safe positive integers; string IDs must be canonical positive decimal integers
and are never rounded. PostgreSQL and ISO timestamps remain unchanged.

Carried snapshots with the same result ID count as one observation; reuse is
reported. A conflicting row for the same ID fails the command. An observation
selected on both sides produces `reused_observation`, not an independent pair.

Pairing requires exact equality of these public dimensions:

- Raw model, hardware, framework, precision, `spec_method`, `benchmark_type`,
  ISL, OSL, concurrency, `offload_mode`, `disagg`, and `is_multinode`.
- Prefill/decode TP, EP, DP-attention flags, worker counts, and GPU counts.
- Exposed configuration inside `metrics`: `prefill_pp`, `decode_pp`, `dcp_size`,
  `pcp_size`, both roles' `dcp_size`/`pcp_size`, `kv_offloading`, offload backend
  name/version, `kv_p2p_transfer`, and router name/version.

Those extended topology fields are producer configuration stored in the numeric
metrics container; runtime descriptors can be strings. Absent and null fields
stay distinct. No default parallelism, fallback between role/aggregate fields,
or assumption that an absent router means “none” is applied. Equal unavailable
fields yield `configuration_completeness: "incomplete_optional_fields"` and a
`configuration_unknown_fields` list. Missing required row identity/configuration
or malformed known topology fails validation. Unknown unrelated metadata is
preserved; this fixed comparison contract cannot certify future unreviewed
configuration dimensions as matched.

Describe prefill/decode fields as role counts (for example, `4/4; disagg=false`),
using the [shared GPU topology rule](../SKILL.md#evidence-and-interpretation).
Matching configuration fields alone does not establish a physical GPU total.

Each complete key must have exactly one before and one after observation.
Multiple candidates yield `ambiguous_configuration`; a missing opposite key
yields `no_matching_configuration`. The helper never chooses the best point,
creates a Cartesian product, interpolates concurrency, or aggregates mixed
recipes. `no_comparable_pairs` is a valid result, not proof of no performance change.

Image and recipe fingerprint are reported separately from the pairing key so an
image transition can be inspected. A producer fingerprint includes the image
and recipe parameters that the public row may not expose. A changed fingerprint
therefore raises `recipe_fingerprint_changed_includes_image_and_unexposed_config`;
it cannot distinguish an image-only update from other hidden changes. Missing
fingerprints stay unknown. Matching fingerprints are preserved as evidence, but
the report always keeps `full_recipe_verified: false` because it has not inspected
the complete producer recipe or verified image immutability.

For each pair, the selected raw metric retains its before/after values. Finite
values produce `delta = after - before`; a finite nonzero baseline also produces
`percent_change = 100 × delta / before`. A zero baseline has no percentage.
Missing metrics remain null in the comparison with explicit coverage status;
they remain absent/null as originally returned in the saved source rows. Invalid
nonnumeric selected metrics fail validation. Non-finite arithmetic is reported
without emitting JSON infinity. The helper assigns no “better,” “worse,” causal,
or statistical verdict; interpret the documented metric unit and direction.

## Investigate a selected pair's producer

When a difference needs explanation, choose the exact `before_id` or `after_id`
from the result and follow [provenance.md](provenance.md). The versioned
`inferencex result inspect` command can corroborate public workflow metadata and inspect one bounded log
window for that selected ID. Prefer its `--run-id` scope using the GitHub run ID
parsed from the row's `run_url`; compare its selected row with the comparison
evidence before interpreting logs. If the latest-attempt endpoint cannot recover
the original point/attempt, keep that limitation instead of replacing it.

Combine source-backed clues with the observed numbers: image/run identity,
exposed topology, fingerprint changes, dates, and missing metadata. Release
notes, reliability counts, and a few log lines do not establish causality or
statistical significance. Completion means every proposed claim is tied to the
selected pair and the report states unmatched rows and unresolved confounders.

## Evidence and output safety

The installed CLI supports Node 24 or 26 and has no runtime dependencies. This
command has a 30-second total operation deadline and 16 MiB per-response and total
decoded-byte limits. It allows at most three GET attempts by default; every retry
decision and attempt is recorded in the manifest. There is no pagination loop or
automatic deadline or byte-limit increase.

Follow the shared [delivery rules](../SKILL.md#deliver-the-requested-result) and
[CLI contract](cli.md) for bundle metadata, evidence retention, output handling,
and final verification. Keep the result's exact scope, selected pairs, exclusions,
limitations, and source references with the report.
