# InferenceX CLI contract 1

Use Node 24 or 26. Run the installed entry point as
`node <skill>/scripts/inferencex.mjs`; the npm package also exposes `inferencex`.
The release target matrix is Linux/macOS by Node 24/26; qualification requires a
retained pass for all four jobs. Windows is not yet qualified.

## Three actions

```bash
inferencex discover models
inferencex powerx export --model GLM-5 --isl 8192 --osl 1024 \
  --output-dir evidence/powerx --require-hardware h200_sxm
inferencex verify evidence/powerx --require-hardware h200_sxm
```

`discover` reads capabilities or current public data. A formal command creates one
new evidence directory containing `result.json` or `result.csv`, decoded response
bodies, and `manifest.json`. `verify` replays that directory without network access.
Use `inferencex describe [command ...]` for fixed input, format, limit, policy, and
schema metadata. Use `inferencex schema <name>` for a published JSON Schema.

## Formal commands

All examples use a new directory. Omit a CI predicate to accept a valid empty or
partial result at exit 0; add the shown predicate when that coverage is required.

```bash
# PowerX: per-GPU W and explicitly scoped accelerator J units; dates are observations.
inferencex powerx export --model GLM-5 --isl 8192 --osl 1024 \
  --output-dir evidence/powerx --require-hardware h200_sxm

# AgentX: summaries are observed trace telemetry, not model-quality scores.
inferencex agentx export --model DeepSeek-V4-Pro --hardware b300 \
  --output-dir evidence/agentx --require-hardware b300

# Result provenance: the producer can differ from the snapshot carrying the row.
inferencex result inspect --id 421 --model DeepSeek-R1-0528 --date 2026-08-09 \
  --output-dir evidence/result --require-hardware h200_sxm

# TCO: prices are explicit USD/GPU-hour assumptions; null means no usable point.
inferencex tco compare --model dsv4 --workloads 1024x1024 --target 50 \
  --gpu-hourly-prices b200=3.6,mi355x=1.8 --output-dir evidence/tco \
  --require-hardware b200 --require-hardware mi355x

# Releases: observed matched configurations do not establish a causal regression.
inferencex releases compare --model GLM-5 --hardware h200_sxm --framework vllm \
  --isl 8192 --osl 1024 --metric median_ttft \
  --before-date 2026-09-01 --after-date 2026-09-02 \
  --before-image vllm:before --after-image vllm:after \
  --output-dir evidence/releases --min-comparable-pairs 1

# CollectiveX: explicit run identities retain source revision and attempt context.
inferencex collectivex compare --left 90071992547409930001 \
  --right 90071992547409930002 --output-dir evidence/collectivex \
  --min-comparable-pairs 1
```

The six domain cookbooks remain authoritative for selection, units, dates, source
identity, and interpretation. A successful empty result is scoped evidence, not
proof that no benchmark ran. Missing values stay null or absent; never fill them
with zero.

## Exit and output handling

Branch on the exit code before parsing stdout:

| Exit  | Meaning                                                | Parse                         |
| ----- | ------------------------------------------------------ | ----------------------------- |
| `0`   | Bundle complete; requested policy absent or passed     | JSON summary or human summary |
| `3`   | Bundle complete; explicit coverage policy failed       | JSON summary and saved bundle |
| `2`   | Invalid arguments                                      | JSON error on stderr          |
| `1`   | Operational, response, verification, or output failure | JSON error on stderr          |
| `130` | Cancelled before bundle commit                         | JSON error on stderr          |

The default error format is JSON; `--error-format text` is available for people.
`--human` changes successful stdout only. If stdout fails after `manifest.json` is
committed, the error includes `bundle_complete: true` and the directory; verify the
directory before consuming it. A pre-commit cancellation leaves an incomplete
directory without a manifest. Complete response bodies and failed attempt ledger
entries already written there are retained for diagnosis.

Formal commands require `--output-dir <new-directory>`. They never reuse, merge, or
overwrite a directory. `verify --report` likewise creates a new report outside the
bundle. The manifest is written last and records normalized arguments, every request
attempt, response hashes, the result hash, coverage, policy, and relative paths.

## Compatibility

- Contract 1 JSON allows additive optional fields. Consumers should read known
  fields and ignore unknown fields. Fields marked required, nullability, units, and
  closed status enums are stable within contract 1.
- PowerX and AgentX contract 1 CSV headers and order are fixed. Unknown future API
  metrics stay in evidence or JSON extensions instead of creating dynamic columns.
- IDs are strings even when they contain only digits. Dates are `YYYY-MM-DD`;
  evidence timestamps are UTC ISO strings.
- Legacy direct scripts keep their historical interfaces and text default. The new
  entry rejects `--output` and `--evidence-dir` with a migration hint. No legacy
  removal date is declared in contract 1.
- The offline legacy verifier accepts only the explicit producer set 0.9.0, 0.10.0,
  0.11.0, and 1.0.0. New bundles dispatch by `contract_version: 1` and preserve the
  producer package version separately.

## Legacy migration

| Legacy direct helper                                  | Contract 1 command                              | Change                                                    |
| ----------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| `export-powerx.mjs --output x --evidence-dir e`       | `inferencex powerx export --output-dir e`       | Result and evidence are one create-new bundle             |
| `export-agentx.mjs --output x --evidence-dir e`       | `inferencex agentx export --output-dir e`       | JSON is default; add `--format csv` when needed           |
| `investigate-result.mjs --output x --evidence-dir e`  | `inferencex result inspect --output-dir e`      | Same bounded producer/log workflow, replayable bundle     |
| `compare-tco.mjs --output x --evidence-dir e`         | `inferencex tco compare --output-dir e`         | Same arithmetic; response body moves into bundle evidence |
| `compare-releases.mjs --output x --evidence-dir e`    | `inferencex releases compare --output-dir e`    | Add `--min-comparable-pairs` for a CI gate                |
| `compare-collectivex.mjs --output x --evidence-dir e` | `inferencex collectivex compare --output-dir e` | Add `--min-comparable-pairs` for a CI gate                |
| `verify-export.mjs --evidence-dir e --export x`       | `inferencex verify e`                           | Contract 1 finds the result from the manifest             |

Legacy output bytes and helper behavior remain available for compatibility. New
automation should use the versioned entry, schemas, fixed bundle layout, and exit 3
policy result.
