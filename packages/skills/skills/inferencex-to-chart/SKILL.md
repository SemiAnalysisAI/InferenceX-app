---
name: inferencex-to-chart
description: 'Create a dark SVG chart for one InferenceX AgentX result, comparing request counts, token lengths and latency distributions by recorded source category. Use when the requested output is a chart.'
---

# InferenceX to Chart

Read [the shared workflow guide](../inferencex-api/SKILL.md) and
[chart and table templates](../inferencex-api/references/chart-templates.md).
They define data capture, supported templates, statistics and reporting scope.

Use the supplied selected-point capture, or capture the user's selected AgentX
result through the cookbook. If neither is supplied, ask for a result ID or saved
capture. The ready template is the recorded-source comparison; use `charts list`
to explain other template availability when the user requests a different chart.

Resolve `../inferencex-api/scripts/inferencex.mjs` from this skill directory and
run it with Node.js 24 or later. Render with `charts agentx-sources --input <capture>
--style chart --output-dir <new-directory>`. Default to `--style chart`; honor an
explicitly requested style, including `--style both` for a chart and table together.

Inspect and link the artifacts for the selected style (`chart.svg` by default)
and `summary.json`, following the cookbook's delivery and interpretation rules.
The shared CLI performs the calculations and rendering.
