# Releasing the InferenceX API skill

The public package is `@semianalysisai/inferencex-skills`. Versions `0.1.0`,
`0.2.0`, `0.3.0`, `0.4.0`, `0.5.0`, `0.6.0`, `0.7.0`, `0.8.0`, `0.9.0`, `0.10.0`, and
`0.11.0` are immutable public releases. The website advertises the verified
`0.11.0` release. For later releases, keep website commands pinned until publication
and public verification succeed. The
[`publish-skills.yml`](../.github/workflows/publish-skills.yml) workflow prepares
future releases; it does not run on application tags or database-backup releases.
Adding this workflow does not configure npm access or prove a successful OIDC release.

## Release ownership and one-time setup

A package owner must add a GitHub Actions trusted publisher in the package's npm
Settings with these exact values:

| Field                | Value                                                      |
| -------------------- | ---------------------------------------------------------- |
| Organization or user | `SemiAnalysisAI`                                           |
| Repository           | `InferenceX-app`                                           |
| Workflow filename    | `publish-skills.yml`                                       |
| Environment          | Leave empty; this workflow does not declare an environment |
| Allowed actions      | Enable **`npm publish`** for direct publication            |

For new configurations created after September 3, 2026, npm permits staged
publishing by default; direct `npm publish` must be selected explicitly. This
workflow uses GitHub-hosted runners, Node 24, npm >=11.5.1, and job-scoped
`contents: read` / `id-token: write`; it needs no npm token secret. npm checks the
repository and workflow identity during publication, not when settings are saved.
See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

Configure this only after the reviewed workflow is integrated. Owner setup and
the first successful OIDC release are separate completion gates. Do not publish a
throwaway version just to test authentication. GitHub repository write access is
required to dispatch the workflow; npm package ownership is required to configure
the trust relationship.

## Prepare and review a candidate

The [`Tests (Skills)` workflow](../.github/workflows/tests-skills.yml) runs one exact
packed archive on Node 24 and 26 across Linux and macOS. A separate schema-consumer
step installs the pinned development dependency from `bun.lock` and validates actual
packed outputs. The suite also runs the Python release-verifier tests. Publication
remains on Node 24 with one publisher runtime.

1. Modify the source, choose a new stable version, and update package metadata,
   the unified CLI version, installation examples, and installed-version
   expectations together. Run the package tests and relevant repository checks.
   Merge the reviewed source before preparing the final accepted archive.
2. Run the following from the repository root using Node 24/npm and Python 3 on
   Linux or macOS (the public verification deadline uses Unix process groups and timers).
   Choose a **new output directory for every attempt**. The commands read the
   version from the source package after its version bump; it must be an unused
   stable version, not an already published release. Keep these shell variables
   for the later checks. Preparation alone does not prove publication.

```bash
skills_release_version="$(node -p "require('./packages/skills/package.json').version")"
skills_release_attempt="$(mktemp -d "${TMPDIR:-/tmp}/inferencex-release.XXXXXX")"
skills_release_dir="$skills_release_attempt/candidate"

node --test packages/skills/test/*.test.mjs
bun install --frozen-lockfile
node packages/skills/test/schema-consumers.mjs
node packages/skills/scripts/release.mjs prepare "$skills_release_version" "$skills_release_dir"
python3 packages/skills/scripts/verify-release.py candidate "$skills_release_dir/release.json" \
  --model DeepSeek-V4-Pro --isl 8192 --osl 1024 \
  --agentx-model DeepSeek-V4-Pro \
  --evidence "$skills_release_attempt/candidate-check"
```

After editing packaged skill files, run `node packages/skills/scripts/update-integrity.mjs`
and commit the refreshed `integrity.json` with the source change. The preparer
checks this inventory without modifying files; it intentionally skips npm lifecycle
scripts so release preparation cannot silently repair unreviewed source.

The preparer requires and records a clean package source state. It rejects dirty
source or a stale integrity inventory before registry access or candidate output, and also rejects a version
mismatch, an already published version, or an unavailable registry check. It packs
once, checks the public file boundary, and records the source commit,
`source_dirty: false`, file list, SHA-256, and npm integrity. Maintainer tools,
tests, credentials, and acceptance artifacts are outside the public package.
The verifier creates two projects outside the repository with fresh npm caches,
empty npm configuration, and an allowlisted environment. It installs the exact
archive for Codex and Claude Code, runs all six formal `inferencex` families, replays
each bundle offline, and audits every result against its saved responses with an
independent Python implementation. Missing and null values remain missing; real
`0` and `false` values remain explicit. No new benchmarks run.

For the 0.12.0 candidate, retain the exact four platform results (Linux/macOS by Node
24/26) and both native runtime results. Each native result covers PowerX, AgentX,
result provenance, TCO, releases, CollectiveX, and offline replay, with archive,
case-set, prompt transcript, and answer transcript hashes. Keep
`tested_source_commit` separate from the archive identity; merging and repreparing
identical bytes must not rewrite which source was actually tested.

Each platform entry also records the Actions run and attempt as numeric strings,
the tested 40-hex commit SHA, the exact matrix job name, and the matching
`SemiAnalysisAI/InferenceX-app` Actions evidence URL. Each native entry retains its
aggregate hashes and seven maintained case records; every case records its case ID,
runtime and assessor pass statuses, and prompt/answer transcript hashes. Known
limitations use the maintained stable codes with descriptions.

The qualification JSON is a reviewed evidence declaration. Its validation checks
the declared archive, matrix, scopes, identities, and hashes before npm mutation;
it is not cryptographic proof that the declared executions occurred. Preserve the
underlying Actions artifacts and native transcripts so reviewers can inspect the
evidence behind each declaration.

The maintained positive scopes cover one strict-v2 PowerX configuration, AgentX
summaries, its result provenance, the dated GLM-5.1/MI355X/SGLang comparison,
explicit TCO test assumptions, and an exact CollectiveX pair. The verifier also
keeps a valid empty PowerX bundle and an exit-3 policy result. These scopes are
release fixtures, not market prices or causal performance claims.

These are live smoke checks, not exhaustive domain or native-agent acceptance.
Missing provenance/logs, unavailable TCO points or missing historical comparison
pairs fail and require reviewing the case. Do not weaken the gate to silently
accept an empty positive example. The same public verification deadline covers
these subprocesses, and failed output and command records remain preserved.

The live check uses the requested model/workload; there is no fixed date or expected
row count. Use `--date YYYY-MM-DD` for a reproducible cutoff and `--raw-model KEY`
when intentionally selecting a particular returned model. A positive example that
no longer returns validated observations fails visibly; review the API and choose
an available workload instead of silently passing an empty export.

Every formal bundle is verified with network access disabled. The independent
oracle checks the six domain derivations, fixed CSV columns, IDs, dates, units,
provenance, coverage and policy decisions from the exact saved bytes. These checks
supplement native discovery acceptance; they do not replace narrative review.

## Independent native-agent acceptance

Run [implicit discovery acceptance](./inferencex-skills-discovery.md) separately
for each candidate whose routing or packaged workflows change. The explicit-use
acceptance below validates application of known instructions; it does not prove
that a fresh agent discovers the installed skill on its own.

Deterministic Node tests, live installed-script verification, and a natural-language
agent run are **three different checks**. The first two do not establish whether an
agent can find and correctly apply the skill. Run this third check when skill
instructions, examples, installer behavior, or export semantics change, and before
accepting the archive for publication.

```bash
python3 packages/skills/scripts/verify-release.py agents "$skills_release_dir/release.json" \
  --model DeepSeek-V4-Pro --isl 8192 --osl 1024 \
  --agentx-model DeepSeek-V4-Pro \
  --evidence "$skills_release_attempt/agent-preparation"

skills_agent_root="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["clean_root"])' "$skills_release_attempt/agent-preparation/verification.json")"
```

The output identifies a new temporary root with `codex/` and `claude/` projects.
Each initially contains only the exact candidate archive and `prompt.txt`; these are
prepared projects, **not completed agent runs**. The prompt asks the agent to install
the archive, inspect status, preview a forced reinstall, run all six formal families,
and verify each resulting directory offline.
Review installer results and filesystem preservation independently; `check-agent`
reports only its data checks. `acceptance.json` identifies both prepared targets and
the candidate archive. The PowerX empty workload defaults to 7/13 tokens; override
`--empty-isl` and `--empty-osl` if that scope ever acquires observations.

Start a fresh Codex or Claude Code session inside the corresponding project and
submit `prompt.txt` without adding repository context. Use the installed agent
runtime's current supported CLI invocation or UI; record its version, exact command
(or UI invocation), model, prompt, exit status, transcript, and final `result.md`.
When using the Codex CLI with `workspace-write`, pass the canonical prepared project
to `-C`, add `--skip-git-repo-check` for this non-Git project, and allow only its
project-level skill directory with `--add-dir <canonical-prepared-project>/.agents`.
Codex otherwise protects `.agents` from workspace writes; do not broaden the sandbox
or install the skill under a different directory.
Disable inherited MCP/private-data connectors and custom global instructions or
record any unavoidable contamination. Give the agent only project files and public
HTTP access; no repository checkout, database credentials, or previous answers.
The agent's own account authentication is separate from API authentication: public
InferenceX requests and npm installations need none. Do not copy agent credentials
into evidence or GitHub Actions secrets for this test.

After each agent completes, independently check its generated files:

```bash
python3 packages/skills/scripts/verify-release.py check-agent "$skills_release_dir/release.json" \
  --project "$skills_agent_root/codex" \
  --model DeepSeek-V4-Pro --isl 8192 --osl 1024 \
  --agentx-model DeepSeek-V4-Pro \
  --evidence "$skills_release_attempt/codex-result-check"
```

Repeat for Claude Code with a new evidence directory. Use the **same scope arguments**
used during preparation. The checker independently reconstructs all six bundle
families from their original response bytes and validates the manifests, hashes,
scope, coverage, policy, dates, units, and provenance. No later refetch replaces
the consumed input.

The checker reports `data-checks-passed`, leaving narrative review explicit. A
different reviewer must inspect the transcript and explanation for:

- Correct units: per-GPU watts, deployment GPU joules, and provisioned estimates
  remain distinct; shared prefill/decode GPU counts are not summed blindly.
- Validated rows can lack the requested metric; missing values are not zero.
- Original observation dates remain separate from snapshot dates and retrieval
  time. API reads are not described as new benchmark runs, and absent observations
  are not treated as proof that no benchmark jobs occurred on a date.
- AgentX filters remain exact and case-sensitive; an empty or excluded selection
  makes no claims beyond its response. Aggregates, derived metrics and trace
  availability are not presented as model-quality scores or rankings.
- The installed skill actually supplied the workflow, the agent used no repository
  or private-data access, and every claim has complete response evidence.
- The checker validates the original consumed responses. A later independent
  refetch is separate evidence and may legitimately contain different observations.

Record the reviewer, accepted SHA-256, agent invocations, evidence paths, and any
limitations. A failed agent attempt remains failed; identify and address the cause,
record any prompt or harness changes, and repeat affected acceptance. If packaged
source changes, create a new archive and rerun acceptance for those new bytes.
Never approve solely from an agent's
statement that its answer is correct. Broader API cookbook examples have their own
packed-example tests and should also be exercised naturally when they change.

## Publish and verify

After source integration, dispatch **Publish InferenceX skills** on the repository's
default branch. Supply the manifest version, accepted archive SHA-256, and reviewed
qualification JSON. Avoid expanding the large nested JSON directly in the command.
Build a workflow-input file and let `gh` read it from standard input:

```bash
export SKILLS_RELEASE_VERSION="$skills_release_version"
export SKILLS_REVIEWED_SHA256='<accepted archive sha256>'
jq -n --rawfile qualification qualification.json \
  '{version: env.SKILLS_RELEASE_VERSION,
    reviewed_sha256: env.SKILLS_REVIEWED_SHA256,
    qualification_json: $qualification}' > publish-inputs.json
gh workflow run publish-skills.yml --ref master --json < publish-inputs.json
```

Inspect and retain `publish-inputs.json` before dispatch. A different branch is
refused. CI runs packed-interface tests, prepares the source archive, and requires
byte-for-byte identity with the reviewed SHA-256. Before npm mutation, it validates
the record's exact archive, four platform jobs, two native runtimes, seven assessed
cases per runtime, hashes, and known limitations.
It performs a clean candidate install/export, checks the digest again,
and publishes that same tarball using OIDC. It then verifies public metadata and
tarball identity and performs anonymous pinned installations/exports with fresh
caches for both targets. Evidence is uploaded even when a check fails.

Public verification retries only an npm install failure containing `ETARGET` and
`No matching version found for @semianalysisai/inferencex-skills@<exact-version>.`
Both must identify the requested package/version. It allows **three attempts per
target**, with **5- and 10-second delays**, within **one 300-second deadline** for
public verification. Each attempt uses a fresh project/cache and retains command
stdout/stderr, npm debug logs, timing and error classification. The deadline bounds
subprocess groups and the complete HTTP response read, including slow bodies.

HTTP errors, authentication/authorization failures, timeouts, integrity mismatches,
wrong versions, malformed API data and incorrect exports fail immediately. This is
not a general retry loop. Candidate verification and `npm publish` never retry.
The 0.2.0 ETARGET failure followed successful publication and later passed read-only
verification; propagation delay is a plausible explanation, not a classification
for arbitrary errors.

If publication succeeds but public verification fails (for example, registry
metadata is not yet available), the version is already immutable. Inspect the
saved failure and rerun **only the read-only verifier**, preserving a new attempt:

```bash
skills_public_attempt="$(mktemp -d "${TMPDIR:-/tmp}/inferencex-public-check.XXXXXX")"
python3 packages/skills/scripts/verify-release.py public "$skills_release_dir/release.json" \
  --model DeepSeek-V4-Pro --isl 8192 --osl 1024 \
  --agentx-model DeepSeek-V4-Pro \
  --evidence "$skills_public_attempt/evidence"
```

Do not rerun publication or bump the version just to hide a failed verification.
Announce availability only after the public verification passes. A prepared
workflow, saved npm settings, and a successful upload each establish less than a
successful end-to-end release.

## Structured failures and recoverable upgrades

The unified CLI emits machine-readable failures by default. Candidate and public
verification cover its invalid-input, operational, cancellation, bundle-completion,
and policy exit codes through the packed suite and six installed workflows.

Packed tests cover operational error categories, graceful cancellation and output
rollback, the five-second stdout deadline, failed staging and receipt writes,
interrupted activation/cleanup, and concurrent installation/recovery. Preserve
failed attempts and inspect the exact archive after any package-byte change.
A local source test or a successful installer invocation does not establish
native skill discovery; run the natural-language acceptance separately.

The installer stages a merged destination and receipt before activation, then
recovers supported owned process-crash states on the next actual installation.
`status` and `--dry-run` inspect recovery without changing files. These checks do
not establish fsync/power-loss durability or repair arbitrary external edits.
The installed [command cookbook](../packages/skills/skills/inferencex-api/references/cli-contract.md)
defines the error envelope, exit policy, read-only inspection and recovery limits.

## User upgrades

Installed skill files do not auto-update. Users select a **published** version and
rerun the installer with `--force`, which overwrites packaged files and preserves
other local files. Review local skill edits first. `npm update` alone does not
replace the copied skill. The installed-version status command can confirm the
result; see the [package README](../packages/skills/README.md). New benchmark data
comes from the live API and does not require a package release.
