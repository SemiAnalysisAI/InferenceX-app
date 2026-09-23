# AgentX chart and table templates

For “what charts can you generate?”, run `inferencex charts list` offline. The
catalog distinguishes ready-to-render templates, data-capture cookbooks and
recommendations needing a custom renderer. The first template compares **recorded request source categories**:
request-count bars, input/output token-length box plots, and completed-request
E2E/TTFT box plots, or tables of the same counts and distributions. A dataset token
histogram and one point's request timeline answer different questions. The timeline
links its capture cookbook; dataset
distributions are a recommendation without a bundled rendering recipe.

## Choose the output style

Use `inferencex-to-chart` for a chart or `inferencex-to-table` for tables and CSV.
The general `inferencex` skill also handles either style. All three entries use
the same command and calculations:

- “Chart main-agent versus subagent request counts, token lengths and latency” →
  `--style chart`.
- “Put the same comparison in a table I can use in my spreadsheet” → `--style table`.
- “Give me the chart and its numbers” → `--style both` (the default).

Charts use a dark SemiAnalysis palette, large labels and Inter-first font fallbacks.
The SVG is standalone; it does not download fonts, logos or plotting libraries.
Tables use a compact count/share overview followed by one distribution table per
metric, with units and valid/missing/excluded counts beside the quantiles. Use the
generated values in both styles; changing presentation does not change population
or statistics.

## Main-agent versus subagent requests

1. Select one positive result ID with available stored telemetry using the
   [selected-point capture recipe](agentx.md#diagnose-one-explicitly-selected-point).
   Save its complete JSON stdout as `selected-point.json`. The recipe preserves
   the result identity, request URL, capture time and raw response bytes. It runs
   public reads, not a new benchmark. An aggregate AgentX export alone does not
   contain the per-request observations needed for these charts.
2. Render locally with the installed entry (or its resolved `scripts/inferencex.mjs`):

   ```bash
   inferencex charts agentx-sources --input selected-point.json \
     --style both --output-dir agentx-source-comparison
   ```

   Add `--phase profiling` or `--phase warmup` for that exact recorded phase.
   The default `all` retains every phase, including unfamiliar phase strings.
   Create the parent directory first; the output leaf must not already exist.

3. Inspect the requested output: `chart.svg` for charts; `table.md` for readable
   tables and `summary.csv` for spreadsheets. The CSV has one row per source/metric,
   including request counts/share, units, sample counts and quantiles.
   Link the requested artifact and `summary.json`, which retains exact values and
   denominators. Every style also writes `requests.csv` with selected observations
   and `source.json` with the original capture. These are local presentation
   artifacts, outside the six formal bundles; `inferencex verify` does not
   accept them. The input SHA-256 identifies saved bytes, not source authenticity.

Group labels reproduce `srcKind`; absent or blank values have a separate
`(source missing)` group. Role meaning remains **unverified** unless source
documentation establishes it, including for names containing `main` or `subagent`.
For example: “`weka_flat` is kept separate; its agent role is unverified.” Unknown
role is different from a confirmed absence of a role. Preserve every category and
its denominator. This command computes no fixed subagent share or causal overhead.

Counts and token lengths include cancelled requests, with their counts shown.
Latency includes only completed requests: E2E is `(end - start) / 1e6` milliseconds;
TTFT is the recorded `ttftMs`. Each metric reports valid, missing and excluded
cancelled counts. Missing observations stay missing; recorded zero stays zero.
Count bars use a linear scale. Box plots use log(1+x) positions to show heavy
tails while retaining zero, min/max whiskers, p25/p75 boxes and median lines.
Printed medians use the panel units (tokens or ms), not log-transformed values.
Quantiles linearly interpolate sorted observations at `(n - 1) * p` (R type 7).
A one-value distribution remains one observation; unavailable latency is labeled.

The population is **one captured result**, not the underlying dataset or every
AgentX run. All retained response rows are processed, but upstream sampling or
omissions are not independently verified. A phase filter is recorded with its
excluded count. Requests with the same conversation/turn identifiers remain
separate observations: concurrent replay lanes can legitimately repeat them.

The command rejects mismatched result IDs, a timeline changed from its retained
response, malformed requests, captures over 64 MiB and more than 40 source
categories. CSV quotes cells and prefixes formula-like strings with an apostrophe
for spreadsheet use; exact source strings remain in JSON. No network request,
plotting-library installation or API key is needed to render the saved capture.
