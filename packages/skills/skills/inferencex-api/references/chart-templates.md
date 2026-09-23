# AgentX chart templates

For “what charts can you generate?”, run `inferencex charts list` offline. The
catalog distinguishes ready-to-render templates, data-capture cookbooks and
recommendations needing a custom renderer. The first template compares **recorded request source categories**:
request-count bars, input/output token-length box plots, and completed-request
E2E/TTFT box plots. A dataset token histogram and one point's request timeline
answer different questions. The timeline links its capture cookbook; dataset
distributions are a recommendation without a bundled rendering recipe.

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
     --output-dir agentx-source-charts
   ```

   Add `--phase profiling` or `--phase warmup` for that exact recorded phase.
   The default `all` retains every phase, including unfamiliar phase strings.
   Create the parent directory first; the output leaf must not already exist.

3. Open `chart.svg`, then use `summary.json` for the exact values and denominators.
   Link the figure and summary in the answer. `requests.csv` contains the selected
   observations; `source.json` preserves the original capture. These are local
   chart artifacts, outside the six formal bundles; `inferencex verify` does not
   accept them. The input SHA-256 identifies saved bytes, not source authenticity.

Group labels reproduce `srcKind`; absent or blank values have a separate
`(source missing)` group. A loader category such as `weka_flat` does not establish
a main/subagent role. Use “main agent” or “subagent” only if the source's documented
category meaning supports that interpretation. Preserve every other category and
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
