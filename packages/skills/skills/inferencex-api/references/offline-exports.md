# Verify saved exports offline

Use this workflow when the user already has a PowerX or AgentX summary export and its evidence directory. The installed `verify-export.mjs` checks the saved bundle and creates a deterministic Markdown report. It makes no HTTP requests, including OpenAPI discovery, and runs no benchmarks.

For a contract 1 directory created by the versioned entry, run
`inferencex verify <directory>` instead; see the [CLI contract](cli.md). The
legacy command below remains for separately saved exports and manifests.

## Required files

Keep the original export and the entire original evidence directory. The evidence directory must contain the complete manifest and every response body listed by that manifest. Keep the export outside the evidence directory; place new reports outside both inputs. Do not edit a manifest, replace a missing response, or recalculate a stored hash to make verification pass.

Supported producers are exactly `0.9.0`, `0.10.0`, `0.11.0`, and `1.0.0`.
Producer 1.0.0 maps explicitly to the retained 0.11 legacy rendering contract;
this does not accept arbitrary 1.x producers. Supported outputs are PowerX
JSON/CSV and AgentX summary JSON/CSV. An AgentX point diagnostic, an incomplete
capture, or an unsupported producer version fails explicitly. A bare CSV or JSON
file without its source evidence cannot establish the full verification chain.

## Run verification

For a Codex installation, from the project containing the saved files:

```bash
mkdir -p reports
node .agents/skills/inferencex-api/scripts/verify-export.mjs \
  --evidence-dir saved/powerx-evidence \
  --export saved/powerx.json \
  --report reports/powerx.md \
  --error-format json
```

For Claude, use `.claude/skills/inferencex-api/scripts/verify-export.mjs`. For AgentX or CSV, select the corresponding saved evidence directory and export path; no separate format flag is needed. With a custom skill directory, use the script at that installed location. `--report` must name a new file in an existing directory. Omitting it writes Markdown to stdout.

Check the exit code before accepting a report. Exit `0` means verification and report output completed; `2` means invalid arguments, `1` means an operational or verification failure, and `130` means cancellation. With `--error-format json`, failures emit one diagnostic to stderr. An already existing report is preserved. Retain failed attempts separately and do not treat partial stdout or an interrupted output write as a complete report. See the [command cookbook](cli-contract.md) for the shared contract.

## What is checked

The verifier checks the supported manifest contract, complete request ledger, exact request scope and chunk IDs, saved response hashes, metadata and counts. It reconstructs the export from those saved responses using the declared producer contract and compares exact output bytes. The historical PowerX JSON shape without top-level `schema_version` remains supported for producer `0.9.0`.

Reports retain scope, source URLs and hashes, retrieval times, observation dates, logical snapshot dates, units, and coverage. Moving an unchanged bundle does not change report bytes. The verifier does not open a historical output destination stored in the manifest.

A complete AgentX enrichment response may legitimately omit an ID; that remains `not_returned`. A missing response file is a verification failure. Preserve the differences between absent, null, zero, false, and unsupported IDs. Cache summary values retain the producer's finite-value checks; the verifier does not add a new claim that ratios were restricted to `[0,1]`.

## Interpretation and limits

Report only consistency against the saved evidence. Matching local hashes do not establish publisher authenticity, independently validate benchmark methodology, or prove that a performance difference has a particular cause. This workflow does not run new benchmarks or refresh the observations. Keep measurement dates separate from snapshot and retrieval dates; missing power is not zero, and whole-deployment energy is not per-GPU power.

Local input limits are 1 MiB for the manifest, 32 MiB per response, 128 MiB for all responses, and 256 MiB for the export. The report limit is 1 MiB. An oversized or unsafe input fails explicitly. Use intact smaller captures when a saved bundle exceeds these bounds; do not truncate its source files. A failed verification should be reported with its diagnostic and the exact affected bundle, without silently replacing it with a new download.
