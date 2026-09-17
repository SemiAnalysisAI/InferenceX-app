# InferenceX CLI contract 1

Use Node 24 or 26. Run the installed entry point as
`node <skill>/scripts/inferencex.mjs`; the npm package also exposes `inferencex`.
The release target matrix is Linux/macOS by Node 24/26; qualification requires a
retained pass for all four jobs. Windows is not yet qualified.

## Three actions

```bash
inferencex discover models
mkdir -p evidence
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
mkdir -p evidence

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

`--require-hardware <key>` checks `coverage.hardware[].valid_records`, not whether a
selected row merely has that hardware label. It passes only when the requested
hardware has `valid_records > 0`. A retained PowerX row without a usable measured
value or AgentX row without a usable aggregate therefore cannot satisfy this policy.

Explain the current invocation's failure from `policy.reasons` and its recorded
requirements and actual values. `coverage.reasons` describe missing evidence in the
whole selection, which can be independent of that failed predicate. For example,
an absent result log makes coverage partial while the result can still count as a
usable hardware observation. Read the reported count for the requested key; do not
infer it from a missing optional field or another hardware's count.

## Exit and output handling

Branch on the exit code before parsing stdout:

| Exit  | Meaning                                                | Parse                         |
| ----- | ------------------------------------------------------ | ----------------------------- |
| `0`   | Bundle complete; requested policy absent or passed     | JSON summary or human summary |
| `3`   | Bundle complete; explicit coverage policy failed       | JSON summary and saved bundle |
| `2`   | Invalid arguments                                      | JSON error on stderr          |
| `1`   | Operational, response, verification, or output failure | JSON error on stderr          |
| `130` | Cancelled before bundle commit                         | JSON error on stderr          |

Offline verification reports `INVALID_EVIDENCE` for incomplete, malformed, tampered,
or inconsistent evidence and `UNSUPPORTED_CONTRACT` for an unknown evidence kind or
contract version. Both exit 1.

The default error format is JSON; `--error-format text` is available for people.
`--human` changes successful stdout only. If stdout fails after `manifest.json` is
committed, the error includes `bundle_complete: true` and the directory; verify the
directory before consuming it. Failure or cancellation before commit may leave an
incomplete directory with response or result files already written. Request/attempt
records commit with `manifest.json`; an incomplete directory does not guarantee a
persisted ledger. Retain the directory for diagnosis and capture stdout, stderr,
and the exit code outside it using the [attempt wrapper](cli-contract.md#handle-one-attempt).

Formal commands require `--output-dir <new-directory>`. Its parent must already
exist; the examples create `evidence` first, and the CLI creates the new leaf. They
never reuse, merge, or overwrite a directory. The manifest is written last and
records normalized arguments, every request attempt, response hashes, the result
hash, coverage, policy, and relative paths.

Once completed, the entire bundle tree is immutable: never add, edit, or delete a
file or directory inside it. Put a README, explanation, or verification report in a
sibling path outside the bundle. Finish those surrounding writes first, then run
`inferencex verify` as the final step. `verify --report` also requires a new path
outside the bundle.

## Compatibility

- Contract 1 JSON allows additive optional fields. Consumers should read known
  fields and ignore unknown fields. Fields marked required, nullability, units, and
  closed status enums are stable within contract 1.
- PowerX and AgentX contract 1 CSV headers and order are fixed. Unknown future API
  metrics stay in evidence or JSON extensions instead of creating dynamic columns.
- IDs are strings even when they contain only digits. Dates are `YYYY-MM-DD`;
  evidence timestamps are UTC ISO strings.
- The 0.12.0 entry rejects removed `--output` and `--evidence-dir` options with a
  migration hint. Contract 1 bundles preserve the producer package version.

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

The direct helpers and `verify-export.mjs` are not query interfaces in 0.12.0.
Exports from 0.11 and earlier require their pinned older package; they are not contract 1
bundles. Installer upgrades from those versions remain supported and do not make old query
commands part of the 0.12.0 interface.
