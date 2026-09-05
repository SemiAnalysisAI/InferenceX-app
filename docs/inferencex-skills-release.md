# Releasing the InferenceX API skill

The public package is `@semianalysisai/inferencex-skills`. Versions `0.1.0` and
`0.2.0` are immutable public releases. `0.3.0` commands below prepare a candidate;
keep website commands pinned to the last verified public version until publication
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

1. Modify the source, choose a new stable version, and update package metadata,
   the exporter's standalone version, installation examples, and installed-version
   expectations together. Run the package tests and the relevant repository checks.
   Review and commit the final source before preparing the accepted archive.
2. Run the following from the repository root using Node 24/npm and Python 3 on
   Linux or macOS (the public verification deadline uses Unix process groups and timers).
   Choose a **new output directory for every attempt**. Substitute the intended
   version; `0.3.0` below is a candidate, not a claim that it is published.

```bash
node --test packages/skills/test/*.test.mjs
node packages/skills/scripts/release.mjs prepare 0.3.0 /tmp/inferencex-release-0.3.0
python3 packages/skills/scripts/verify-release.py candidate /tmp/inferencex-release-0.3.0/release.json \
  --model DeepSeek-V4-Pro --isl 8192 --osl 1024 \
  --evidence /tmp/inferencex-candidate-check-0.3.0
```

The preparer rejects a version mismatch, an already published version, and an
unavailable registry check. It packs once, checks the public file boundary, and
records the source commit, whether the package source was dirty, file list, SHA-256,
and npm integrity. A dirty-source preparation is useful for iteration but is not
the final reviewed release candidate. Maintainer tools,
tests, credentials, and acceptance artifacts are outside the public package.
The verifier creates two projects outside the repository with fresh npm caches,
empty npm configuration, and an allowlisted environment. It installs the exact
archive for Codex and Claude Code and checks every JSON row and CSV field against
the complete public responses actually used by the installed exporter. Missing
metrics stay missing and real zeroes remain zero. No new benchmarks run.

The live check uses the requested model/workload; there is no fixed date or expected
row count. Use `--date YYYY-MM-DD` for a reproducible cutoff and `--raw-model KEY`
when intentionally selecting a particular returned model. A positive example that
no longer returns validated observations fails visibly; review the API and choose
an available workload instead of silently passing an empty export.

## Independent native-agent acceptance

Deterministic Node tests, live installed-script verification, and a natural-language
agent run are **three different checks**. The first two do not establish whether an
agent can find and correctly apply the skill. Run this third check when skill
instructions, examples, installer behavior, or export semantics change, and before
accepting the archive for publication.

```bash
python3 packages/skills/scripts/verify-release.py agents /tmp/inferencex-release-0.3.0/release.json \
  --model DeepSeek-V4-Pro --isl 8192 --osl 1024 \
  --evidence /tmp/inferencex-agent-preparation-0.3.0
```

The output identifies a new temporary root with `codex/` and `claude/` projects.
Each contains only the installed skill, installation logs, and `prompt.txt` with a
natural-language lookup, PowerX export, and exact empty-workload request. These are
prepared projects, **not completed agent runs**. The prompt also requests installer
JSON status and a forced dry-run using the exact candidate archive, while preserving
the installed skill. Review these structured results and filesystem preservation
independently; `check-agent` reports only its data checks. Their `acceptance.json` identifies
the candidate archive. The empty workload defaults to 7/13 tokens; override
`--empty-isl` and `--empty-osl` if that scope ever acquires observations.

Start a fresh Codex or Claude Code session inside the corresponding project and
submit `prompt.txt` without adding repository context. Use the installed agent
runtime's current supported CLI invocation or UI; record its version, exact command
(or UI invocation), model, prompt, exit status, transcript, and final `result.md`.
Disable inherited MCP/private-data connectors and custom global instructions or
record any unavoidable contamination. Give the agent only project files and public
HTTP access; no repository checkout, database credentials, or previous answers.
The agent's own account authentication is separate from API authentication: public
InferenceX requests and npm installations need none. Do not copy agent credentials
into evidence or GitHub Actions secrets for this test.

After each agent completes, independently check its generated files:

```bash
python3 packages/skills/scripts/verify-release.py check-agent /tmp/inferencex-release-0.3.0/release.json \
  --project /tmp/inferencex-skill-acceptance-REPLACE/codex \
  --model DeepSeek-V4-Pro --isl 8192 --osl 1024 \
  --evidence /tmp/inferencex-codex-result-check-0.3.0
```

Repeat for Claude Code with a new evidence directory. Use the **same scope arguments**
used during preparation. The checker validates the original responses captured by each operation, including
all CSV values, complete JSON observations, requested scope, exclusions, metric
coverage, latest-observation selection, and exact empty/diagnostic scope. It checks
the exporter manifests, body/output hashes, and each operation's own retrieval
time. No later refetch replaces the consumed input. A later live comparison, if
needed, is separate evidence and may legitimately contain different observations.

The checker reports `data-checks-passed`, leaving narrative review explicit. A
different reviewer must inspect the transcript and explanation for:

- Correct units: per-GPU watts, deployment GPU joules, and provisioned estimates
  remain distinct; shared prefill/decode GPU counts are not summed blindly.
- Validated rows can lack the requested metric; missing values are not zero.
- Original observation dates remain separate from snapshot dates and retrieval
  time. API reads are not described as new benchmark runs, and absent observations
  are not treated as proof that no benchmark jobs occurred on a date.
- The empty result is retained, diagnosis keeps its exact scope, and uncertainty
  is explained if the diagnostic request fails.
- The installed skill actually supplied the workflow and the agent used no
  repository or private-data access. All claims have complete response evidence.
  Confirm that the agent retained its full unfiltered, strict-before-filtering,
  and diagnostic responses with request context. The checker validates the originals;
  a later independent refetch is separate evidence.
  A separate agent request to the same URL is also a refetch; require the response
  consumed by each operation, including separate CSV and JSON exporter invocations.

Record the reviewer, accepted SHA-256, agent invocations, evidence paths, and any
limitations. A failed agent attempt remains failed; identify and address the cause,
record any prompt or harness changes, and repeat affected acceptance. If packaged
source changes, create a new archive and rerun acceptance for those new bytes.
Never approve solely from an agent's
statement that its answer is correct. Broader API cookbook examples have their own
packed-example tests and should also be exercised naturally when they change.

## Publish and verify

After source integration, dispatch **Publish InferenceX skills** on the repository's
default branch. Supply the manifest version and the SHA-256 from the accepted
archive. A different branch is refused. CI runs packed-interface tests, repacks the
source, and requires byte-for-byte identity with the reviewed SHA-256 before any
publication. It performs a clean candidate install/export, checks the digest again,
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
python3 packages/skills/scripts/verify-release.py public /tmp/inferencex-release-0.3.0/release.json \
  --model DeepSeek-V4-Pro --isl 8192 --osl 1024 \
  --evidence /tmp/inferencex-public-check-0.3.0-attempt2
```

Do not rerun publication or bump the version just to hide a failed verification.
Announce availability only after the public verification passes. A prepared
workflow, saved npm settings, and a successful upload each establish less than a
successful end-to-end release.

## User upgrades

Installed skill files do not auto-update. Users select a **published** version and
rerun the installer with `--force`, which overwrites packaged files and preserves
other local files. Review local skill edits first. `npm update` alone does not
replace the copied skill. The installed-version status command can confirm the
result; see the [package README](../packages/skills/README.md). New benchmark data
comes from the live API and does not require a package release.
