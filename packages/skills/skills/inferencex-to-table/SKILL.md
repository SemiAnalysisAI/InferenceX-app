---
name: inferencex-to-table
description: 'Create a concise table image and supporting spreadsheet CSV for one InferenceX AgentX result, comparing request counts and median token lengths and latency by recorded source category. Use when the requested output is a table or CSV.'
---

# InferenceX to Table

Read [the shared workflow guide](../inferencex-api/SKILL.md) and
[chart and table templates](../inferencex-api/references/chart-templates.md).
They define data capture, supported templates, statistics and reporting scope.

Use the supplied selected-point capture, or capture the user's selected AgentX
result through the cookbook. If neither is supplied, ask for a result ID or saved
capture. The ready template is the recorded-source comparison; use `charts list`
to explain other template availability when the user requests a different table.

Resolve `../inferencex-api/scripts/inferencex.mjs` from this skill directory and
run it with Node.js 24 or later. Render with
`charts agentx-sources --input <capture> --style table --output-dir <new-directory>`.
The table image always shows request counts, share and all four medians. Default to
`--style table`; honor an explicitly requested style, including `--style both` with
the chart's `--metric` for a chart and table together.

Inspect the generated image(s). Deliver an image embed, not just a download link:

```markdown
![AgentX table](absolute-path-to-table.svg)

Result <id> · phase <phase>. Captured rows only; source roles and upstream completeness unverified.
```

If the host needs a raster preview, embed that faithful preview and link the SVG.
Keep the default reply to the image, one scope sentence and at most one details
link. Detailed tables, file inventories and methodology belong in the saved files;
expand the reply when the user asks for them. The shared CLI performs calculations
and rendering; follow the cookbook's interpretation rules.
