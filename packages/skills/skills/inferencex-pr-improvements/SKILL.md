---
name: inferencex-pr-improvements
description: Show historical inference throughput gains and modeled cost reductions alongside associated source PRs and benchmark runs. Use for PR-linked performance improvement history at fixed interactivity, from the InferenceX API or a saved waterfall response. Produces a chart, summary, and CSV.
---

# InferenceX PR Improvements

Turn the user's request into a chart of the eligible baseline, successive records,
and best observation. Use the bundled `scripts/waterfall.mjs` with Node.js 24+;
resolve its path from this `SKILL.md`. It consumes the API's computed steps,
retains the response and request metadata, and writes `chart.svg`, `steps.csv`
and `summary.md`. The package installer includes this skill and its shared
`inferencex-api` request-header helper; no API key or extra dependency is needed.

## Choose the input

For a supplied historical waterfall JSON, render it directly with `--input`.
The saved response owns its selectors; live query flags cannot be combined with
`--input`. These outputs are raw-view artifacts, not formal `inferencex verify`
bundles.

For a fresh query, preserve the requested model, hardware/engine, precision,
workload, metric, target and date range. Resolve ambiguous model or hardware names
from `https://inferencex.semianalysis.com/api/v1/views/options` and the public
availability/configuration data, using the [shared discovery workflow](../inferencex-api/SKILL.md).
A broad GPU family can return multiple engine/precision
series; keep them separate. Use `--framework` and `--precision` when specified.

With complete selectors, run the helper directly. Its live mode checks deployed
OpenAPI before querying `/api/v1/views/historical?chart=waterfall`.
If that deployment lacks the feature, report the capability error and retained
receipt. A supplied compatible capture can still be rendered; an ordinary trend
response cannot substitute for a waterfall response.

Use the helper's `--help` for flags and defaults. Unless the user specifies
otherwise, use output throughput, 8K/1K, target 35 tok/s/user, and all available
history. Disclose those defaults and the response's resolved precision.
Explicit user selections take precedence.

## Run

Create the output parent first; the leaf must be new. Run these commands from this
skill directory, or resolve `scripts/waterfall.mjs` relative to this file.

```bash
node scripts/waterfall.mjs \
  --model DeepSeek-R1-0528 --hardware h200 --framework sglang \
  --precision fp8 --sequence 8k/1k --metric outputTputPerGpu \
  --target 35 --out /path/to/new-output

node scripts/waterfall.mjs \
  --input /path/to/saved-waterfall.json --out /path/to/new-output
```

Use `costhOutput` for owning cost per million output tokens. The helper's live
cost query uses current internal TCO assumptions; describe these as modeled costs.
Use `agentic-traces` for AgentX. Its operating point is **P90 interactivity**
(`1 / P90 full-response ITL`), while single-turn workloads use median
interactivity. The helper validates the returned statistic and field.

An exit of zero means rendering completed. Read the saved summary and response:
an empty selection is a valid no-data result, not a zero-percent improvement.
For an error, explain it from stderr and any retained response; preserve the
attempt and use a new output directory for a corrected invocation.

## Deliver

Inspect the chart, then embed it and link the summary/CSV. Report:

- Exact series, precision, metric/unit, target and interactivity statistic.
- Baseline → best values, percentage change and their observation dates.
- Omitted dates, unavailable link lookups and absent PR matches where relevant.

Values are interpolated at the target. Best observed is not necessarily latest.
Regressions, recoveries and synthetic extensions are omitted; baseline and best
bars are totals rather than incremental gains. Source links establish provenance,
not an isolated causal effect of a PR. Output-only metrics omit dates without
recorded output throughput.

Use the generated chart and CSV as the reproducible output. A dashboard link is
supplementary: verify that it retains waterfall mode, target and series before
describing it as the same view.

## Example invocations

In Codex, mention `$inferencex-pr-improvements` or select it from the skills picker:

```text
$inferencex-pr-improvements R1 on H200 SGLang FP8, 8K/1K, output throughput at 35 tok/s/user.
$inferencex-pr-improvements Same R1/H200 selection, but owning cost per million output tokens.
$inferencex-pr-improvements DeepSeek-V4-Pro on B200 SGLang FP4, Agentic Traces, output throughput at P90 interactivity 35.
```

Claude Code uses `/inferencex-pr-improvements`. For a fresh installation use
`inferencex-skills install --target codex` or `--target claude`. Existing entries
are skipped: check `status`, save local edits, and preview `install --force --dry-run`
with the same target and scope before an authorized `install --force` upgrade.
This entry invokes the bundled helper; it does not add an
`inferencex historical waterfall` CLI subcommand.
