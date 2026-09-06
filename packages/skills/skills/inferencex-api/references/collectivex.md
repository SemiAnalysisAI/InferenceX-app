# Compare existing CollectiveX runs

Use this cookbook to discover public communication sweeps, compare two returned
runs, and export the evidence. These are existing observations; no new benchmark
is run. Public GETs can populate the service's documented lazy cache from existing
GitHub artifacts. No database credentials, admin operations, or launch tools are
needed.

## 1. Discover and export

Example request: "Find two recent measured communication runs and compare their
matching configurations. Save the complete source responses, include unavailable
cases, and explain which observations cannot be compared."

Run from a project with the npm skill installed for Codex:

```bash
node .agents/skills/inferencex-api/scripts/compare-collectivex.mjs --output collectivex-comparison.json
```

For Claude Code, use the corresponding installed path:

```bash
node .claude/skills/inferencex-api/scripts/compare-collectivex.mjs --output collectivex-comparison.json
```

Requires Node 24+. The helper checks the current OpenAPI operations, reads the run
list **once**, and selects its two newest runs with `measured_cases > 0`, ordered
by numeric run ID. The older selection is `left`; the newer is `right`. This is a
bounded example selection, not a representative sample. A cancelled or failed
workflow can still contain measured cases; its conclusion remains in the export.

For a requested pair, supply both exact string IDs from discovery:

```bash
node .agents/skills/inferencex-api/scripts/compare-collectivex.mjs --left <left-run-id> --right <right-run-id> --output collectivex-pair.json
```

The explicit pair makes three GETs; discovery makes at most four. Each request has
a 30-second timeout, and all decoded responses share a 32 MiB budget. There are no
retries or polling. The output is JSON only. `--output` requires an existing parent
directory and a **new file path**; it refuses to overwrite a file, directory, or
symlink. It publishes the file only after every read and comparison succeeds.
Omitting `--output` writes to stdout; shell redirection can truncate a destination
before the helper runs, so use `--output` when preserving files matters.

The public operations require `version=1`:

| Operation                                                                                        | Meaning                                                                          |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [`/collectivex/latest`](https://inferencex.semianalysis.com/api/v1/collectivex/latest?version=1) | Newest available run by run ID; it need not contain measurements.                |
| [`/collectivex/runs`](https://inferencex.semianalysis.com/api/v1/collectivex/runs?version=1)     | Retained summaries and `discovery_complete`; the helper uses this for selection. |
| `/collectivex/runs/{runId}`                                                                      | One run dataset, possibly refreshed to a newer attempt.                          |

All paths above are under `/api/v1`. Consult the [public API reference](https://inferencex.semianalysis.com/api)
and [OpenAPI document](https://inferencex.semianalysis.com/api/openapi.json) for the
current contract. A missing/unsupported version is HTTP 400. HTTP 404, an upstream
502/503, malformed data, a redirect, or an interrupted response is a failed read,
not an empty comparison. The helper exits nonzero and publishes no export on
those failures; it never substitutes a different run.

`discovery_complete=false` means further bounded discovery passes may reveal more
runs. Report that flag even when two selections were available. The route has no
documented `limit`, `offset`, or cursor: do not invent pagination parameters. If
fewer than two measured summaries were returned, the helper exports
`fewer_than_two_measured_runs` and makes no detail requests. Further discovery, if
needed, should have an explicit small request budget and retain each response.

Even `discovery_complete=true` does **not** mean complete workflow history. Recent
discovery has a bounded upstream window, artifacts expire, and retained runs can
outlive their artifacts. The export therefore always sets `history_complete=false`.
Stored fallback data can also be served when upstream refresh fails. Compare each
detail's returned `run_attempt` with its discovery summary; a later attempt is a
different snapshot, even under the same run ID.

## 2. Check comparability before interpreting differences

The helper creates groups using exact returned identities, with no interpolation,
aggregation, best-of selection, or hardware ranking:

| Suite       | Required matching identity                                                                                                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| EP          | Full series configuration, including `series_id`, backend, phase, kernel mode, precision (dtype), hardware/vendor, and every `system` topology field; operation; `tokens_per_rank`; `global_tokens`; component `payload_bytes`.                                                      |
| KV-transfer | Case configuration including `case_id`, backend, hardware/vendor, fabric, workload, precision, and topology; row `kind`, `isl`, `page_tokens`, `batch`, `op`, `descs`, and `req_bytes`. Cosmetic labels and outcome/reason text are retained as evidence but excluded from matching. |

Topology includes EP/rank count (`ep_size`), nodes, GPUs per node, scale-up domain,
scale-up and scale-out transports, and topology class. Keep a declared null
scale-out transport distinct from a missing topology field. Tokens per rank alone
do not identify a message size; EP compares the returned aggregate payload bytes
as well. KV keeps bytes per request separate from burst size (`batch`). Comparing
different SKUs, backends, dtypes, operations, or topologies requires a separate,
explicitly qualified analysis; this helper leaves them unmatched.

Read every comparison status:

- `matched`: exactly one observation on each side has the same complete public
  identity. Only these groups receive metric differences and ratios.
- `only_left` / `only_right`: no exact counterpart was returned. This does not
  prove the other system failed, is unsupported, or has zero performance.
- `ambiguous`: an identity occurs more than once on either side. All source
  pointers remain; the helper selects none of the duplicates.
- `incomparable`: an identity field or byte count is missing/invalid, an EP
  component is unavailable, or a KV case/verification is not successful.

`summary` counts comparison groups, including EP operation groups, not runs or
requested cases. Cases with **no measured rows** have no comparison group. Inspect
the complete datasets' `coverage` and optional `kv` arrays for their outcome,
disposition, reason, detail, and per-point terminal status. Retain pending,
unsupported, failed, invalid, diagnostic, and unavailable cases in the answer's
coverage statement. A successful workflow does not imply complete measurement
coverage; absence of the optional `kv` field does not imply a failed KV suite.

Matching is deliberately conservative: a changed case ID remains unmatched even
if visible labels look alike. `comparison_scope.basis=exact_public_identity`
describes the fields exposed by this API, not proof of a controlled experiment.
The API returns an **assembled dataset**, not the original matrix/shard artifacts,
software build manifests, or every runtime setting. Preserve each `source_sha`;
`source_sha_equal=false` is a revision difference, not evidence of its causal
effect. Equal SHAs also do not establish identical runtime conditions.

## 3. Preserve units, missing values, and sources

| Metric family                                        | Meaning and unit                                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| EP `latency_us`                                      | Operation latency in microseconds. Compare the same percentile.                                                                               |
| EP `activation_data_rate_gbps_at_latency_percentile` | Aggregate activation-data rate in **GB/s**, excluding FP8 scale bytes.                                                                        |
| EP `payload_data_rate_gbps_at_latency_percentile`    | Full payload rate in **GB/s per GPU**, including recorded scale bytes. `payload_bytes` is aggregate bytes across the EP world.                |
| EP `roundtrip_token_rate_at_latency_percentile`      | Aggregate tokens/s at the named latency percentile.                                                                                           |
| KV `latency_ms` / `request_ms`                       | Whole-burst latency / per-request completion latency in milliseconds; `n` is sample count. A missing `request_ms` is not whole-burst latency. |
| KV `prep_ms`, `gbps_p50`, `gbps_p50_incl_prep`       | Preparation time in ms per burst, GB/s excluding preparation, and GB/s including preparation.                                                 |

The spelling `gbps` in field names does not mean gigabits/s. Rate-at-latency-p99 is
a rate derived at p99 latency, not an independently measured p99 bandwidth.
Keep EP microseconds and KV milliseconds distinct. The reader can use wire-byte
provenance when present and legacy logical/activation-byte fallbacks otherwise;
the public dataset does not expose all of that provenance. Equal reported bytes
alone do not prove equal physical wire traffic. Describe reported payload rates,
not link saturation, bus bandwidth, or a reconstructed raw message distribution.

Each metric retains `status: value`, `null`, or `missing`; real zero is a value.
`difference_right_minus_left` and `ratio_right_over_left` use only two finite
values. A zero left denominator yields a null ratio. Null ratios/differences do
not mean equality. Raw response text preserves omitted fields and additional
returned fields without inventing defaults. The server's shared reader has its
own compatibility fallbacks, so returned defaults are not independently verified
artifact provenance.

Save the JSON beside the answer. `responses[]` contains each exact request URL,
HTTP status, retrieval timestamp, SHA-256 of the decoded response bytes, and
complete `body_text`, including the OpenAPI response. Parse `body_text` to inspect
the original dataset; comparison source pointers identify a response index and
JSON Pointer within that parsed body. Run IDs remain exact strings, and
`runs[].run` retains the returned attempt, `generated_at`, conclusion, and source
SHA. Retrieval time and generated time describe different events. Cite URLs and
timestamps from **this export**, never from another selection or an older example.

Report the selected runs and attempts, discovery coverage, matched/unmatched/
ambiguous/incomparable counts, the specific metric/percentile and units, and
relevant unmeasured coverage. Summarize numerical differences only from the
complete requested set of `matched` groups. Keep the result scoped to the two
returned snapshots and state that no new benchmarks were run.
