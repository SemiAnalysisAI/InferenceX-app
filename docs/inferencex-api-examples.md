# InferenceX API skill examples

Use the public `@semianalysisai/inferencex-skills@0.4.0` package to query existing
observations; these requests do not run new benchmarks. The skill covers the
public API, with single-turn PowerX export as its first worked example. Read the
[current API contract](https://inferencex.semianalysis.com/api/openapi.json) before
constructing requests.

## Install

With Node 24 or later and npm, run the command for your agent from your project:

```bash
# Codex
npm exec --yes --package @semianalysisai/inferencex-skills@0.4.0 -- inferencex-skills install --target codex

# Claude Code
npm exec --yes --package @semianalysisai/inferencex-skills@0.4.0 -- inferencex-skills install --target claude
```

Start an agent session in that project. Queries need public HTTPS access, with no
InferenceX checkout or database credentials. The skill uses HTTP directly; the
repository's MCP server is a separate integration.

To upgrade, choose a new published version and add `--force`. Existing skills are
otherwise skipped. Save local edits first: force overwrites matching files and
retains obsolete files. Installed copies do not update automatically.

## Find recent benchmark observations

> Use inferencex-api to show up to five latest available DeepSeek-V4-Pro
> observations, limited to raw model dsv4 and single-turn requests with 8192 input
> and 1024 output tokens. Include observation IDs, hardware, framework,
> concurrency, actual measurement dates and source links. Report the query URL,
> retrieval time and matching count before sampling; keep snapshot provenance
> separate from the original observations.

Follow the installed `SKILL.md` lookup recipe. Fetch the full benchmark response,
apply workload and raw-model filters locally, then sort newest first by each observation's
`date` before taking five; the API array is not chronological. Omitted `date`
means latest available observations. A benchmark `date` parameter is an as-of
cutoff unless `exact=true`, and even an exact snapshot can carry older observations.

## Export measured PowerX data

Run the installed exporter from the same project:

```bash
node .agents/skills/inferencex-api/scripts/export-powerx.mjs \
  --model DeepSeek-V4-Pro --raw-model dsv4 --isl 8192 --osl 1024 \
  --output powerx.csv 2> powerx-report.log

node .agents/skills/inferencex-api/scripts/export-powerx.mjs \
  --model DeepSeek-V4-Pro --raw-model dsv4 --isl 8192 --osl 1024 \
  --format json --output powerx.json
```

For Claude Code, replace `.agents/skills` with `.claude/skills`. Add
`--date YYYY-MM-DD` for an as-of cutoff. The exporter requests
`powerValid=strictV2` and selects the exact single-turn workload locally. Keep the
CSV report log: it records the request URL, retrieval time, filters,
returned/selected counts and metric coverage even when no rows match. JSON keeps
complete selected rows and extraction metadata, including available producer
identities and separate `curve_*` snapshot fields.

`avg_power_w` is measured mean watts **per GPU**. Schema-v2
`joules_per_output_token` divides **whole-deployment GPU energy** by generated
output tokens; role-prefixed energy describes that role. These measurements differ
from provisioned-power estimates and facility energy. Do not add prefill and
decode GPU counts when the roles share the same GPUs.

Only numeric `power_valid === 1` and `power_metric_schema_version === 2` qualify
for strictV2; invalid and legacy observations are excluded. An eligible row may
still lack a requested metric. Preserve missing values as blank
CSV cells or unavailable JSON fields, keep genuine zeros unchanged, and report
`metric_coverage`; missing power is not evidence of an efficiency advantage.

## Explain an empty selection

> Use inferencex-api to export strictV2 PowerX data for DeepSeek-V4-Pro, raw model
> dsv4, with exactly 7 input and 13 output tokens in a single-turn request. If no
> rows match, preserve the empty result and use the PowerX cookbook's single
> same-scope diagnostic request to explain it. Keep the model, workload and date
> scope unchanged; do not substitute another workload.

The installed `references/powerx.md` contains the diagnostic recipe. It removes
only the strict-power filter and classifies any same-scope observations separately
from the validated export. No matching observations in that response means none were
returned for that scope; it does not prove that no benchmark jobs ran. Missing
metrics on a nonempty result do not by themselves require another request.
