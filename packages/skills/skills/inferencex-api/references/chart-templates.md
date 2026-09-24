# AgentX chart and table templates

For “what charts can you generate?”, run `inferencex charts list` offline. The
catalog distinguishes ready-to-render templates, data-capture cookbooks and
recommendations needing a custom renderer. The first template compares **recorded
request source categories**: a chart of one metric (request counts, token lengths or
latency) or one table image of counts and medians. A dataset token histogram and one point's request timeline
answer different questions. The timeline links its capture cookbook; dataset
distributions are a recommendation without a bundled rendering recipe.

## Choose the output style

Use `inferencex-to-chart` for a chart or `inferencex-to-table` for a table image and CSV.
The general `inferencex` skill also handles either style. All three entries use
the same command and calculations. Choose the chart metric from the user's question:

| Question                                 | Metric               | Chart values                                |
| ---------------------------------------- | -------------------- | ------------------------------------------- |
| How many requests came from each source? | `requests` (default) | Request count and share                     |
| How long were the input prompts?         | `input-tokens`       | Median input tokens                         |
| How long were the outputs?               | `output-tokens`      | Median output tokens                        |
| How long did requests take?              | `e2e`                | Median completed-request E2E (µs, ms or s)  |
| How long until the first token?          | `ttft`               | Median completed-request TTFT (µs, ms or s) |

Use `--style chart` for a chart, `--style table` for a table image with supporting
files, or `--style both` (the CLI default) for both. The table image always shows
request counts, share and all four medians, so `--metric` changes only the chart.
When several charts are requested, render each metric into its own output directory.

The layout follows the data. One source renders as a single large figure; up to
seven sources with short labels render as columns; eight or more, or labels that
need more than two lines, render as horizontal bars ranked by value. Past 20
sources, the 19 with the most requests keep their rows and the rest fold into a
grey “Other” row for counts, or into a footnote for medians, which cannot be summed;
`summary.csv` keeps every source. The table image shows sources as columns up to
four and as ranked rows beyond that. Images stay 1200 px wide and grow taller with
more rows. Labels wrap to two lines; denser charts shorten long labels in the middle
and keep the full label as the SVG tooltip.

Charts use a dark SemiAnalysis palette, large labels and Inter-first font fallbacks.
The SVG is standalone; it does not download fonts, logos or plotting libraries.
Each image labels every value directly, without axes or gridlines. Full quantiles
and valid/missing/excluded counts remain in `summary.json`; table outputs also
include detailed Markdown and CSV. Use the generated values in both styles;
changing presentation does not change population or statistics.

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
     --metric requests --style both --output-dir agentx-source-comparison
   ```

   Add `--phase profiling` or `--phase warmup` for that exact recorded phase.
   The default `all` retains every phase, including unfamiliar phase strings.
   Create the parent directory first; the output leaf must not already exist.

3. Inspect and show the requested image first: `chart.svg` for charts or `table.svg`
   for tables. Use an image embed, one sentence naming the result and phase, and at most one
   optional details link. Leave the full table, file inventory and methodology in the
   saved files unless requested. If the host cannot display SVG, use its
   available preview or raster export to show the same image; the CLI itself emits SVG.
   `summary.json` retains exact values and denominators. Table mode also writes
   `table.md` and `summary.csv`, with one CSV row per source/metric including
   counts/share, units, sample counts and quantiles. Every style writes `requests.csv`
   with selected observations and `source.json` with the original capture. These are
   local presentation artifacts, outside the six formal bundles; `inferencex verify`
   does not accept them. The input SHA-256 identifies saved bytes, not source authenticity.

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
Bars start at zero on a linear scale. Token values are medians in tokens; latency
medians use µs, ms or s so tiny positive values never display as zero. The full
distribution remains in the detailed files, where latency keeps its millisecond units.
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
