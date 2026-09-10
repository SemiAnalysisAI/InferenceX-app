# Overview data contract and repairs

The September 10, 2026 audit traced `/overview` from the main
`SemiAnalysisAI/InferenceX` producer through ETL, stored rows, API reads and the
page's serving frontiers. The app baseline was `9752d602`; the producer baseline
was `21bec226`. The producer's total-throughput arithmetic was correct. The
overview applied a second disaggregation penalty and hid useful measurements.

## Cost and coverage

`cost_per_million_total_tokens = gpu_hour_cost * 1_000_000 / (3600 * tput_per_gpu)`.
The rate is the hardware registry's hyperscaler GPU-hour assumption, not a
measured invoice. Input tokens include cached input. These are workload-specific
total-token costs, not output-token prices or a workload-independent ranking.

The producer already divides total throughput by all physical deployment chips.
Do not multiply it by `decode / (prefill + decode)` again. Fixed-sequence
disaggregated input/output fields have role-specific denominators; AgentX's
three throughput fields all use the entire deployment. See the producer's
[fixed-sequence aggregation](https://github.com/SemiAnalysisAI/InferenceX/blob/21bec22689a8f8274f50123ff11c72a6c5e36410/infx/results/fixed_sequence.py)
and [AgentX aggregation](https://github.com/SemiAnalysisAI/InferenceX/blob/21bec22689a8f8274f50123ff11c72a6c5e36410/utils/agentic/aggregation/process_agentic_result.py).

An independent request-profile calculation counted 3,603,566,231 input tokens
plus 26,257,390 output tokens over 3,629.862174258 seconds on 12 GPUs:
83,332.44823870831 total tok/s/GPU. At $2.31/GPU-hour this is
$0.00770008178 per million total tokens at that measured knot. The erroneous
8/12 factor raised it to $0.01155012267. The knot is above 50 tok/s/user;
the interpolated tier value is a separate calculation. Regression tests cover
both a source-derived AgentX observation and changing fixed-sequence topologies.

Each hardware column now selects the lowest cost across eligible FP4/FP8 and
speculative/standard decoding serving series. It retains engine, model, scenario,
offload, release and snapshot boundaries. The chosen tier is a **minimum SLO**:
an observed endpoint above it qualifies at its observed throughput, with a visible
actual-speed label. Interpolation remains within each measured Pareto frontier;
there is no extrapolation. A platform whose eligible measurements all fall below
the SLO remains missing. Current and historical snapshots use the same policy.
The overview's curated hardware/model/scenario scopes remain intentional; it has
no unofficial-run overlay. Shared ingestion fixes also reach unofficial imports.

## Dates and refresh

The cost evidence link labels measurement completion when a retained profile
provides it, otherwise the workflow-run attempt date with “measurement date
unavailable.” Its logical curve snapshot is labeled separately and still pins
the source-dashboard link. A reused profile in the audit ran August 12–13,
belonged to an August 14 attempt, and appeared in an August 25 curve snapshot.
Those dates are not interchangeable. A curve with incomplete measurement-date
coverage uses the consistently labeled run-date domain for its evidence.

Profile ingest records optional `measurement_start_unix_seconds` and
`measurement_end_unix_seconds` from successful profiling requests, including
one-token requests and excluding warmup/errors. The existing full-response
backfill fills missing dates without replacing already populated timing metrics
unless `--force` is used. Aggregate re-ingestion preserves attached-profile dates.

The browser's visited-state cache expires after five minutes. Visible tabs check
every 30 seconds and on focus; stale responses cannot replace a newer selection
or repopulate a cache invalidated by fresh server props. Background refreshes
preserve history and focus. The overview, /run and /rankings derived server cache keys are bumped; normal
ingestion still invalidates the server's DB caches. A client refresh does not
repair failed ingestion or an uninvalidated server cache.

## GPU topology and rollout

For identified single-node InferenceX producers, physical chips are
`TP * PP * PCP`; EP partitions TP devices and does not multiply them. Future
fixed-sequence ingest now follows the same contract as AgentX, preserving
explicit physical counts. One archived Dynamo artifact labeled a complete
8-GPU colocated result as `disagg=true, 8P+0D`; its input plus output throughput
matches total throughput. ETL recognizes this complete zero-decode shape and
mirrors its single pool into the schema's two role columns with `disagg=false`.
This does not change the stored throughput.

The audit found 105 current AgentX rows whose stored counts disagreed with their
independent total/per-GPU throughput ratio. Updating code does not repair these
existing rows. Run the following **read-only plan** first:

```bash
bun run --cwd packages/db db:backfill-benchmark-topology
```

The September 10 read-only dry run selected 225 rows including history: 223 AgentX count
repairs and two zero-decode classifications. It repairs only the exact legacy
TP×EP fallback where AgentX's aggregate ratio confirms TP×PP×PCP, plus the complete
zero-decode shape. Manual/proprietary deployments, TPUs, unknown shapes, explicit
nonlegacy counts, and fixed-sequence counts without independent evidence are
left alone. Old fixed-sequence counts require source-artifact re-ingestion;
the tool does not infer their original producer contract from dimensions alone.

After an operator reviews the plan, append `--apply` (interactive confirmation)
or `--apply --yes` (unattended). Apply uses one transaction, checks that the
planned row's config ID and metrics have not changed, and aborts on a uniqueness
conflict. It changes benchmark config references, retaining result IDs, metrics,
logs and replay links; shared config records and evaluations are not rewritten.
It refreshes `latest_benchmarks` after commit. If that refresh fails, the repair
is already committed: rerun the materialized-view refresh before verification.

Separately, the existing command
`bun run --cwd packages/db db:backfill-full-response-interactivity` fills retained
profile dates. It prompts before writing; `--limit N` permits a small first batch.
Do not use `--force` merely to add dates. After either repair, invalidate the
website DB cache using the existing admin cache command, then compare the affected
raw rows and overview values. The audit and PR preparation do not apply these
production database writes.

## Validation

An independent Python implementation of Pareto filtering, Steffen slopes, cubic
Hermite interpolation, configuration selection and cost arithmetic matched all
4,200 checked cells across the captured current snapshot and four historical
snapshots, six SLO tiers, both engine scopes, and the expanded model set. Unit
regressions additionally cover UTC measurement boundaries, refresh races,
unofficial artifact normalization and dry-run/transaction-conflict behavior.
