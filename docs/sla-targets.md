# SLA Targets

SLA Targets (`/infx/sla-targets`, feature-gated, `noindex`) evaluates benchmark results against
service targets a reader enters: a maximum time to first token (TTFT), a maximum time per output
token (TPOT), an optional maximum end-to-end latency, and a required attainment. This document
is the measurement contract behind the page and its API, and a plain account of what the stored
historical data can and cannot support.

> Evaluates benchmark results against your service targets. Results apply to the tested workload
> and conditions; they do not guarantee production SLA compliance.

The thresholds on this page are the reader's targets. They are unrelated to the fixed
interactivity limits used elsewhere on the dashboard.

## Where the code lives

| Piece                                                                       | Location                                                                                                                                |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Evaluation library: accounting, exact evaluation, qualification, selections | `packages/constants/src/sla-targets.ts`                                                                                                 |
| Adapter from the original AgentX export, harness log and aggregate          | `packages/db/src/etl/sla-attempts.ts`                                                                                                   |
| Storage, ingest wiring, backfill                                            | `packages/db/migrations/030_sla_attempts.sql`, `packages/db/src/etl/trace-replay-ingest.ts`, `packages/db/src/backfill-sla-attempts.ts` |
| Reads                                                                       | `packages/db/src/queries/sla-targets.ts`                                                                                                |
| Dataset, server evaluation, view                                            | `packages/app/src/lib/sla-targets/`                                                                                                     |
| Routes                                                                      | `GET /api/v1/sla-targets`, `GET /api/v1/sla-evaluations`                                                                                |
| Page                                                                        | `packages/app/src/components/sla-targets/`                                                                                              |
| Captured fixture                                                            | `packages/app/scripts/capture-sla-targets-fixtures.ts`                                                                                  |

## Measurement contract

### The unit: one attempt

An attempt is a request the load generator dispatched during the profiling phase.

- Warmup requests are excluded and counted (`warmupExcluded`).
- A request the load generator issued but dropped before dispatch is counted separately
  (`skippedBeforeDispatch`) and is never an attempt. In the AgentX harness this is a record with
  `error.type == "CreditProcessingError"`.
- The harness never retries a request: one issued request, at most one record
  (`retryAccounting: "no_client_retries"`). A client that does retry must count every try as an
  attempt or declare `unknown`.

### Outcomes are explicit

Every attempt has exactly one outcome. An outcome is never derived from a latency value being
present.

| Outcome      | What it means                                          | Evidence in the AgentX export                                                                                                                                                        |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `completed`  | The request returned a response.                       | A record with `error: null`.                                                                                                                                                         |
| `failed`     | The client recorded an error. The error class is kept. | A record with `error`. An HTTP rejection becomes `http_<status>`; an exception keeps its class name, such as `InvalidInferenceResultError` (a 2xx stream that delivered no content). |
| `cancelled`  | The client cancelled the request on purpose.           | `was_cancelled` or `RequestCancellationError`. Not used by AgentX runs.                                                                                                              |
| `incomplete` | Still in flight when the run was cut off.              | No record. Counted by the harness log (`cancelled=`).                                                                                                                                |
| `unknown`    | Dispatched, with no recorded outcome.                  | An issued request that no record, cutoff count, skip count or rejection count accounts for.                                                                                          |

Two consequences worth stating:

- A stream that delivered a first token and then failed is a failed attempt. The harness drops
  the TTFT of such a record; even where a record carries one, it is ignored.
- A completed record that lacks a value a target needs (for example a stream that ended without
  usage, so no token count and no TPOT) is missing telemetry, not a service failure. It stays
  `completed` and is counted under `missingTelemetry`.

### Reconciliation

`reconcileSlaAccounting` reconciles the requests the load generator says it issued against every
class:

```
issued = completed + failed + cancelled + incomplete + unknown
       + skippedBeforeDispatch + contextOverflowRejected
```

`accountingCompleteness` says how far that got, with a machine-readable `reason`:

| Completeness | Reason                       | Meaning                                                                                                   |
| ------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `complete`   | `reconciled`                 | Issued count known; every issued request is accounted for.                                                |
| `partial`    | `outcomes_unknown`           | Issued count known; some attempts have no recorded outcome.                                               |
| `partial`    | `dispatch_count_unavailable` | Records with explicit outcomes, but no issued count. The records give a lower bound (`issuedLowerBound`). |
| `unknown`    | `outcomes_not_explicit`      | Outcomes were inferred from the derived request timeline.                                                 |
| `unknown`    | `records_exceed_dispatched`  | More records than issued requests; neither number is trusted.                                             |
| `unknown`    | `no_attempt_records`         | Nothing to count.                                                                                         |

The eligible population is established only for `reconciled` and `outcomes_unknown`. In every
other case the point cannot qualify: its observed values are shown as exploratory and it is left
out of every ranking.

### Accounting window

The AgentX harness dispatches for the configured duration (3,600 s), gives in-flight requests a
30 s grace period, then cancels what is left. A request dispatched inside the window that
finishes during grace is an ordinary attempt of that window.

Three durations exist for one load point, and they differ:

| Duration                    | Source                                                                | Typical value                                              |
| --------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| Configured profiling window | harness log, `target: 3600.0s duration`                               | 3,600 s                                                    |
| Phase elapsed               | harness log, `elapsed=`                                               | 3,600 to 3,640 s (includes grace and a cancellation drain) |
| Client throughput duration  | aggregate `benchmark_duration`: last valid response minus first start | 3,585 to 3,630 s                                           |

All three are stored. One is used, and the result names it (`durationSource`). When the export
lacks the policy's time base, the next source in a fixed order is used and the result says which;
a source is never swapped silently.

### Exact evaluation

Targets are evaluated on the server, per attempt, against the stored latencies:

- A target is used exactly as entered. It is never rounded or snapped to a step, and a value that
  cannot be evaluated is rejected with a message (`400`).
- The verdict is joint: one attempt must meet every enabled target itself. Joint attainment is
  never derived from separate percentiles. The page shows the per-target shares only as context.
- Latencies are stored in whole microseconds. A value equal to the target passes.
- TPOT is the average decode time per output token within a request, not a bound on every gap
  between tokens. A completed request with fewer than two output tokens has no TPOT, so the TPOT
  target does not apply to it. This is a policy choice and holds for both workload families.
- No histogram is used. The per-attempt data of the largest stored point is a few megabytes, so
  exact evaluation is affordable and a binned approximation is not justified.

The server returns counts and accounting per load point, never attempt records. Cached
evaluations are keyed by the benchmark point, the content hash of its attempt data, the evaluator
version (`SLA_EVALUATOR_VERSION`), the extraction version (`SLA_ATTEMPTS_VERSION`), the
accounting policy (`slaAccountingPolicyKey`) and the three target values.

### Measurements and qualification are separate

`observed` holds what was measured: attempted, passing, not passing and indeterminate counts,
attainment, goodput, the achieved request rate, and the window. `qualification` holds the
verdict and its reason. A point below the sample policy keeps its observed values.

| Status              | When                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Meets target`      | Population established, sample large enough, `passing / attempted >= required`.                                                                          |
| `Misses target`     | Population established, sample large enough, and the target is missed even if every indeterminate attempt had passed. Also a load the service failed at. |
| `Insufficient data` | Anything else, with the reason. Never a pass, never a zero.                                                                                              |

The sample policy (`SLA_SAMPLE_POLICY`) is a configurable heuristic: a point needs at least 100
attempts and enough attempts that one miss still meets the required attainment (200 at 99.5%,
1,000 at 99.9%). It keeps a verdict from resting on a handful of requests. It is not a confidence
interval and gives no statistical guarantee.

### Three selections per configuration

Each is chosen among qualifying points only, and each names the load point that supports it:

- the highest tested passing load. It is literal: when a lower tested load missed, the row says
  so instead of implying a monotonic range;
- the highest goodput;
- the lowest estimated cost per 1,000 compliant requests.

They can be three different points.

### Goodput and cost

- Goodput is passing attempts per second of the accounting window. The achieved request rate
  (completed attempts per second) is shown separately.
- Cost per 1,000 compliant requests is the GPU price times the GPU count times the accounting
  window, divided by passing attempts, times 1,000. Every GPU is billed for the whole window,
  idle time included. It is an estimate from the dashboard's price table (`costh` by default,
  `costr` selectable), not a measured bill.

### Load semantics

- AgentX concurrency is the number of replay lanes: simulated users replaying recorded sessions.
- Fixed-sequence concurrency is the limit on requests in flight at once.

They are labelled differently and never both called "concurrent users". Both are closed-loop, so
neither is an offered request rate, and a result says nothing about capacity at a given request
arrival rate.

### Configuration identity

One row is one serving configuration in one workflow run: hardware, framework, precision,
speculative decoding, prefill and decode topology, and KV offload mode. Points of different
offload modes, topologies or runs never share a row. When a run has several attempts at the same
load, the latest attempt is the measured point, as in ingest.

### Failed and excluded load points

A load the run tested without producing a measurement is a first-class input with a reason:

| Category              | Verdict           | Example                                                                             |
| --------------------- | ----------------- | ----------------------------------------------------------------------------------- |
| `service_failure`     | Misses target     | The harness aborted the run because more than 10% of profiling requests failed.     |
| `invalid_measurement` | Insufficient data | The benchmark run itself was invalid.                                               |
| `undetermined`        | Insufficient data | The job failed and its records do not say whether the service or the benchmark did. |

Attainment is never computed from the partial export of an aborted run.

## Policy decisions

Four judgment calls are fields of `SlaAccountingPolicy`. Each can be changed in one place, and a
change gives cached evaluations a new key.

| Decision                                                       | Current choice                                                                                                                          | Alternative                                                                              | Why it matters                                                                                                                                                                 |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Attempts in flight at the cutoff (`incompleteAtCutoff`)        | `not_passing`: in the denominator, counted as not passing. The attainment with them removed is reported next to it.                     | `indeterminate`: a miss is declared only when it would hold even had all of them passed. | They are cancelled without a record, so their TTFT and TPOT are unknown. At 512 lanes they were 1.9% of attempts, which alone rules out a 99% target under the current choice. |
| Context-overflow rejections (`contextOverflow`)                | `excluded`: reported, not eligible, because the trace does not fit the model. A point is flagged above the harness's 1% validity limit. | `failed_attempt`: eligible, failed with class `context_overflow`.                        | The harness removes them from the export. None occurred in the runs examined.                                                                                                  |
| Completed attempts with missing telemetry (`missingTelemetry`) | `not_passing`, counted under missing telemetry.                                                                                         | `indeterminate`.                                                                         | Rare in completed runs.                                                                                                                                                        |
| Time base of goodput and cost (`timeBase`)                     | `configured_window`: the one duration that is equal across load points. Warmup and grace time are not billed.                           | `phase_elapsed`: includes grace and drain.                                               | Up to about 1% difference in goodput and cost.                                                                                                                                 |

## What historical data can and cannot support

### What the app stores

For AgentX points the database stores the original `profile_export.jsonl` and a derived request
timeline. It never stored the harness log (`aiperf.log`) or the harness aggregate
(`profile_export_aiperf.json`). Fixed-sequence points store aggregates only.

### What the original export gives

Verified on the captured runs, harness versions 0.12.0 to 1.0.14, where every point read with
its harness log reconciles exactly:

- The explicit outcome of every attempt that returned: completed, or failed with its error class.
- Its TTFT, TPOT, end-to-end latency and output length.
- The phase of each record, so warmup can be excluded.
- A sequential id per issued request, which gives a lower bound on the issued count and
  identifies gaps below the highest id.

### What it does not give

- **The number of requests issued.** It exists only in the harness log
  (`sending complete | sent=N`).
- **Attempts cut off in flight.** They are cancelled without a record; the count exists only in
  the harness log (`cancelled=`). Examples: 1 of 154 at 1 lane, 173 of 22,607 at 384 lanes,
  430 of 22,823 at 512 lanes. From the export alone the gaps found 173 of 173 and 56 of 57, but
  0 of 1 where the missing request had the highest id.
- **Context-overflow rejections.** Removed from the export; counted only in the aggregate.
- **The TTFT of a stream that failed after its first token.** The harness drops it.
- **Failed load points.** A load whose job failed is not ingested, so the database has no row
  for it.

### Consequences, by kind of point

| Point                                                                         | Outcomes                           | Population  | What the page shows                                                                                               |
| ----------------------------------------------------------------------------- | ---------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Ingested after this change (export, harness log and aggregate read at ingest) | Explicit                           | Established | A verdict.                                                                                                        |
| Already stored, after `db:backfill-sla-attempts` (export only)                | Explicit                           | Lower bound | Exploratory: observed values, no verdict, not ranked.                                                             |
| Already stored, before the backfill, or before migration 030 is applied       | Inferred from the derived timeline | Unknown     | Exploratory. A request with a TTFT is taken as completed; one without is `unknown`, neither a failure nor a pass. |
| Already stored, artifacts still on GitHub (90 days)                           | Explicit                           | Recoverable | A verdict once its harness counters are attached. No tool does this for an existing row yet; see open items.      |
| Fixed-sequence, any date                                                      | None per request                   | None        | Insufficient data: no request-level data.                                                                         |

The page never shows an unqualified "Meets target" for a point whose dispatched attempts cannot
be established.

Post-processing in the benchmark repository cannot fill these gaps either: its published
per-point JSON counts errors of both phases together (in one export 1,734 of 1,798 "errors" were
warmup artefacts) and carries neither the issued count nor the cutoff count.

## Storage and rollout

1. **Migration 030** adds `sla_attempts_gz`, `sla_attempts_version` and `sla_attempts_sha256` to
   `agentic_trace_replay`. It is nullable and additive. Nothing applies it automatically.
2. **Ingest** builds the attempt data from the profile export and, when the artifact has them,
   `aiperf_artifacts/logs/aiperf.log` (or the console copy `benchmark.log`) and
   `profile_export_aiperf.json`. An artifact without them still yields attempt data, as a lower
   bound.
3. **`bun run --cwd packages/db db:backfill-sla-attempts`** fills the column for stored rows from
   the export each row already holds. It writes only the three new columns.
4. **Before 1 to 3**, the routes work unchanged: they detect that the column is absent and
   evaluate from the derived timeline, exploratory.

The attempt data holds no policy decision, so a policy change needs no re-ingest.

## The captured fixture

Without a database (`E2E_FIXTURES=1`) the page serves a captured snapshot and says so. The
snapshot is real: `capture:sla-fixtures` reads GitHub Actions artifacts of
`SemiAnalysisAI/InferenceX` through byte-range requests and builds the attempt data with the same
adapter ingest uses. Nothing is generated or adjusted.

| Run           | What it contributes                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `36463674051` | DeepSeek-V4-Pro on B300 with SGLang, 1 to 512 lanes; cutoff cancellations at high load.                                        |
| `40421997301` | DeepSeek-V4-Pro on B200 with Dynamo and SGLang; a 256-lane attempt the harness aborted on HTTP 503s, and its successful retry. |
| `34857875250` | DeepSeek-V4-Pro on H200, read deliberately without the harness log: how a stored historical point evaluates.                   |
| `43561310271` | GLM-5.3-Flash on MI325X; explicit errors at low load, both KV offload modes.                                                   |
| `43587669179` | Kimi-K3.1-Pro on GB300; explicit errors, a failed job with no recorded cause, a point without an export.                       |

GitHub keeps artifacts for 90 days, so the run list has to be refreshed over time.

## Fixed-sequence workloads

Fixed-sequence runs store aggregates only today, so every fixed-sequence point reads
"Insufficient data: no request-level data". The library already types their load as a
request-concurrency limit. Retaining per-request records for future runs is a separate change to
the benchmark client and to ingest; historical fixed-sequence runs cannot be evaluated and do
not need to be rerun for the AgentX view to work.

## Not covered

- Session-level success for AgentX. The harness replays recorded conversations and never judges
  an answer, so a session has no outcome. Results are per request.
- Open-loop capacity. The benchmarks are closed-loop.
- A public read-only view (`/api/v1/views/sla-targets`) and its skills reference. The page reads
  two page-owned routes while the contract is under review; `DASHBOARD_API_COVERAGE` records the
  exclusion and what has to ship before the tab leaves the feature gate.

## Open items

- Attach harness counters to rows that are already stored while their artifacts are still on
  GitHub. It needs a run-scoped backfill that matches each artifact to its stored row.
- Store failed load points. Ingest skips a load whose job failed; the per-job events of the
  benchmark repository (`job_event_*`) carry the outcome and could be ingested.
- Emit the issued, cutoff and overflow counts in the published per-point JSON of the benchmark
  repository, so accounting does not depend on parsing a log.
- Whether the four policy decisions above are the intended ones.
