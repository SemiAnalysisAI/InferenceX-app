# InferenceX API skill: three reproducible examples

These examples use the public `@semianalysisai/inferencex-skills@0.1.0` package.
They demonstrate a benchmark lookup, a measured PowerX export, and an explanation
of an empty selection. The skill also guides other public API operations through
the [current OpenAPI](https://inferencex.semianalysis.com/api/openapi.json).

**No new benchmark runs were made.** The saved outputs below contain historical
observations retrieved on September 5, 2026 UTC (September 4 PDT). Retrieval dates,
query cutoffs, observation dates, and snapshot dates describe different events.
Repeating a public request may return different data after ingestion or correction;
the saved counts are evidence for these captures, not required future results.

## Install in an empty project

Use Node 24 or later with npm and the agent of your choice. Run one command from
the project where the agent should discover the skill:

```bash
# Codex
npm exec --yes --package @semianalysisai/inferencex-skills@0.1.0 -- inferencex-skills install --target codex

# Claude Code
npm exec --yes --package @semianalysisai/inferencex-skills@0.1.0 -- inferencex-skills install --target claude
```

Open an agent session in that project. These examples need public HTTPS access,
with no InferenceX checkout or database credentials. The skill uses HTTP directly;
the repository's MCP server remains a separate integration with its own setup.

## 1. Find recent benchmark observations

Ask:

> Use inferencex-api to show five latest available DeepSeek-V4-Pro observations
> as of 2026-09-04, limited to raw model dsv4 and single-turn requests with 8192
> input and 1024 output tokens. Include observation IDs, actual measurement dates,
> hardware, framework, concurrency, source run links, the query URL, retrieval
> time, and the total matching count before sampling. Preserve the snapshot
> provenance separately and state whether any new benchmark runs occurred.

The installed `SKILL.md` provides the basic lookup recipe. The agent adds the
documented date cutoff and raw-model selection, then sorts by each observation's
own `date` before taking five. It must not assume the API array is chronological.

The [saved lookup sample](examples/inferencex-api/0.1.0/lookup.json) records 442
matching observations from 913 returned rows, retrieved at
`2026-09-05T01:01:50.399Z`. The five sampled observations were measured on
`2026-09-03`; their IDs are `440994`, `440983`, `440977`, `440979`, and `440980`.
They use `b200` / `vllm` at concurrency 64, 128, 256, 512, and 1024.
Date ties retain API order; the sample claims no ordering within a date.

Request: [ordinary benchmark response](https://inferencex.semianalysis.com/api/v1/benchmarks?model=DeepSeek-V4-Pro&date=2026-09-04).
This example does not filter for valid measured power.

## 2. Export measured PowerX data

Ask:

> Use inferencex-api to export measured PowerX data for DeepSeek-V4-Pro as of
> 2026-09-04, raw model dsv4, single-turn requests with exactly 8192 input and
> 1024 output tokens. Require strictV2 and create powerx.csv and powerx.json.
> Include measured watts per GPU, deployment J/output token, available prefill
> power, configurations, and source identities. Preserve missing values and
> report filters, returned/selected counts, requested-metric coverage, retrieval
> time, measurement dates, and separate snapshot provenance.

The same export can be run directly after installation:

```bash
node .agents/skills/inferencex-api/scripts/export-powerx.mjs \
  --model DeepSeek-V4-Pro --date 2026-09-04 --raw-model dsv4 \
  --isl 8192 --osl 1024 --output powerx.csv 2> powerx-report.log

node .agents/skills/inferencex-api/scripts/export-powerx.mjs \
  --model DeepSeek-V4-Pro --date 2026-09-04 --raw-model dsv4 \
  --isl 8192 --osl 1024 --format json --output powerx.json
```

For Claude Code, use `.claude/skills` in the script path. Keep the report alongside
the CSV: the log includes request and coverage metadata, even when no rows match.

Download the complete saved [CSV](examples/inferencex-api/0.1.0/powerx.csv) or
[JSON](examples/inferencex-api/0.1.0/powerx.json). On GitHub, use **Raw** or the
download action to save the file instead of copying a rendered preview.

| Captured result                            | Value                               |
| ------------------------------------------ | ----------------------------------- |
| Request cutoff                             | 2026-09-04, as-of                   |
| JSON retrieval time                        | 2026-09-05T01:02:34.158Z            |
| StrictV2 rows returned                     | 96                                  |
| Selected exact-workload rows               | 37                                  |
| Excluded outside this workload             | 59                                  |
| Measurement dates                          | 2026-08-26, 2026-09-01, 2026-09-03  |
| Mean watts / deployment J per output token | Available in all 37 selected rows   |
| Prefill watts                              | Available in 14 rows; missing in 23 |

Request: [strictV2 benchmark response](https://inferencex.semianalysis.com/api/v1/benchmarks?model=DeepSeek-V4-Pro&date=2026-09-04&powerValid=strictV2).
The workload and raw-model filters are applied locally and recorded in metadata.

`avg_power_w` is measured mean watts **per GPU**. Schema-v2
`joules_per_output_token` uses **whole-deployment GPU energy**, without dividing by
GPU count. Role-prefixed energy describes that role. Provisioned power estimates
and facility energy are different quantities. Do not add prefill and decode GPU
counts on configurations where both roles share the same GPUs.

A strictV2 row may still lack an individual metric. The 23 missing prefill values
stay blank in CSV and unavailable in JSON; they are not zero or an efficiency win.
The JSON retains complete selected rows, including optional producer and snapshot
fields supplied by the API. Exact source IDs and `run_url` values remain intact.

## 3. Explain an empty selection

Ask:

> Use inferencex-api to export strictV2 PowerX data for DeepSeek-V4-Pro as of
> 2026-09-04, raw model dsv4, with exactly 7 input and 13 output tokens in a
> single-turn request. If no rows match, preserve that empty result and explain
> it using the cookbook's single same-scope diagnostic request. Do not substitute
> a different workload or claim that all benchmark data is missing.

The [saved strict result](examples/inferencex-api/0.1.0/unavailable.json) has zero
selected rows from 96 strictV2 rows returned at `2026-09-05T01:02:34.621Z`.
The [separate diagnostic](examples/inferencex-api/0.1.0/diagnostic.json), retrieved
at `2026-09-05T01:02:59.839Z`, found zero observations in the same exact scope among
913 ordinary benchmark rows. This capture supports **no observations for that
scope**, rather than a claim that every workload is unavailable.

The installed `references/powerx.md` contains the bounded diagnostic recipe. It
removes only the strict-power filter and retains the original workload/model/date.
The diagnostic is an explicit additional read; the exporter does not silently
substitute invalid or legacy observations. Missing values on a nonempty result do
not by themselves require another request.

## Evidence and updates

The examples came from independent installed-agent acceptance of the reviewed
archive. The public npm archive was subsequently verified byte-identical, and
fresh public installation/export passed for both targets. The
[evidence manifest](examples/inferencex-api/0.1.0/evidence.json) records the package
archive checksum and the downloadable file checksums. Local-only response-file
pointers were removed from the lookup/diagnostic summaries. JSON whitespace was
normalized without changing values; CSV bytes are unchanged.

To upgrade an existing installation, choose a newly published version in the npm
command and add `--force`. Without it, the installer skips an existing skill.
Force overwrites matching files, preserves neighboring skills, and retains old
files no longer shipped by the package. Save local modifications first. Repeating
a command pinned to `0.1.0` reinstalls that version; installed copies do not update
in the background.
