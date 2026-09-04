# InferenceX API skill implementation plan

**Status:** Research and proposed implementation plan, 2026-09-04. No implementation, installation, branch change, PR creation, or publication is authorized by this document alone.

**Goal:** Publish one installable public `inferencex-api` skill that helps Codex and Claude Code retrieve and export InferenceX benchmark and PowerX data accurately from the public HTTP API.

**Architecture:** Use the shipped API foundation from [PR #938](https://github.com/SemiAnalysisAI/InferenceX-app/pull/938), its current OpenAPI contract, and the `packages/skills` packaging work in [PR #901](https://github.com/SemiAnalysisAI/InferenceX-app/pull/901). Reuse the existing proposed npm identity, `@semianalysisai/inferencex-skills`, and ship only `inferencex-api` in the first release. The skill contains a short workflow and focused reference material; the API remains responsible for its published data contract.

## Scope and evidence

The current API audit establishes #938 as the shipped foundation. #901 already contains an npm package, installer, API skill, and three visualization skills, but its proposal and README do not prove npm availability. Its API skill must be adapted to the shipped API before reuse. The earlier registry check returned 404; publication status must be refreshed immediately before choosing a release version. The authoritative production entry points are the [API reference](https://inferencex.semianalysis.com/api) and [OpenAPI document](https://inferencex.semianalysis.com/api/openapi.json).

This first release covers endpoint discovery, benchmark lookup, PowerX measurements and validity, provenance, unavailable-data handling, and reproducible JSON/CSV export. The visualization skills, new views API, SDK, alternate package, and plugin distribution are deferred. They are not prerequisites for this release.

The standard entry point is `SKILL.md`, with `name` and `description` frontmatter. Keep its description specific enough to trigger for InferenceX API and PowerX extraction. Detailed endpoint schemas belong in the live OpenAPI document; supporting references should explain the workflow and interpretation. [Agent Skills specification](https://agentskills.io/specification)

### Verified baseline

| Evidence          | Observed state                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Current workspace | Clean `codex/pr-840-audit` checkout at `22d602f00f790febd5a750f36e4899f66983ed7f`; implementation should start in a separate worktree from refreshed `master`.                 |
| Remote `master`   | `cc5d87cd37a3a502ce63b58c8985fa034fa07965` when checked during this research.                                                                                                  |
| #938              | Merged at 2026-09-04 23:06:24 UTC; its strict filter and measured-power documentation are deployed.                                                                            |
| #901              | Open at `7fd82810ea628b6185f817aede1676a567b59bf2`; reuse this package source selectively.                                                                                     |
| #939              | Open at `ae58fc88dfd9a98ab7d5fe375c6e38d530eefb5f` when checked; populated audit provenance is not a dependency of the first skill release.                                    |
| Live PowerX check | At 23:21 UTC, the dated strict query below returned 96 rows; local single-turn 8192/1024 filtering retained 37. These are response-coverage counts, not new benchmark results. |

The inspected query was [benchmarks with model=DeepSeek-V4-Pro, date=2026-09-04, and powerValid=strictV2](https://inferencex.semianalysis.com/api/v1/benchmarks?model=DeepSeek-V4-Pro&date=2026-09-04&powerValid=strictV2). All 96 rows had numeric validity `1` and schema `2`; the other 59 were `agentic_traces`. The 37 selected rows had measurement dates August 26, September 1, and September 3. This confirms that the requested date is an as-of cutoff. No benchmark runs were launched.

Current OpenAPI already describes optional audit/reason fields, but the sampled rows had no populated audit and their workers were null. The exporter must preserve that absence. Original benchmark IDs and curve workflow IDs were strings; producer workflow IDs were absent. The source run URL was present. Preserve these distinct identities rather than filling missing producer fields from curve metadata. [Benchmark handler](https://github.com/SemiAnalysisAI/InferenceX-app/blob/cc5d87cd37a3a502ce63b58c8985fa034fa07965/packages/app/src/app/api/v1/benchmarks/route.ts), [OpenAPI](https://inferencex.semianalysis.com/api/openapi.json)

Three independent research passes covered package/CI reuse, live PowerX semantics, and distribution/release requirements. This document combines their findings; planned implementation tests have not yet been run.

## File map

Paths are repository-relative implementation targets. Existing package paths below were verified in #901; they may need to be brought forward from that PR rather than modified in the present checkout.

| Action            | Path                                                                   | Responsibility                                                                                            |
| ----------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Reuse and revise  | `packages/skills/package.json`                                         | Existing npm name, executable, package allowlist, release metadata, Node requirement, package test script |
| Reuse and revise  | `packages/skills/bin/install.mjs`                                      | Install the single API skill into a selected agent directory                                              |
| Reuse and revise  | `packages/skills/README.md`                                            | Bilingual installation, upgrade, API scope, prerequisites, examples, release status                       |
| Reuse and rewrite | `packages/skills/skills/inferencex-api/SKILL.md`                       | Public API workflow and triggering metadata                                                               |
| Create            | `packages/skills/skills/inferencex-api/reference/powerx.md`            | Measurement meanings, validity, provenance, missing-data and export cookbook                              |
| Create            | `packages/skills/skills/inferencex-api/scripts/export-powerx.mjs`      | Node standard-library extraction and reproducible JSON/CSV export                                         |
| Create            | `packages/skills/test/install.test.mjs`                                | Installer behavior using temporary directories and Node's test runner                                     |
| Create            | `packages/skills/test/package.test.mjs`                                | Packed single-skill artifact, executable and resolvable local references                                  |
| Create            | `packages/skills/test/export-powerx.test.mjs`                          | HTTP query, filtering, nulls, provenance and export regression tests                                      |
| Modify            | `.github/workflows/tests-unit.yml`                                     | Include `packages/skills/**` in the unit-workflow path filter                                             |
| Update as needed  | `bun.lock`                                                             | Record the new workspace using the existing package manager                                               |
| Modify            | `packages/app/src/components/api-documentation/api-reference-page.tsx` | Small bilingual Agent skill onboarding section using existing `CopyableCodeBlock`                         |
| Modify            | `packages/app/cypress/e2e/api-documentation.cy.ts`                     | English and Chinese installation/cookbook section coverage                                                |

The shared API page renders both English and Chinese pages. Its operation quickstarts are generated as curl commands from actual API operations, so the installer belongs in a small separate page section. No new route, synthetic API operation, or separate schema registry is required.

Do not carry forward #901's exhaustive `reference/endpoints.md`: the short common workflow lives in `SKILL.md`, current endpoint details come from OpenAPI, and PowerX-specific interpretation lives in the one cookbook. Avoid duplicating the schema. The production [quickstart generator](https://github.com/SemiAnalysisAI/InferenceX-app/blob/cc5d87cd37a3a502ce63b58c8985fa034fa07965/packages/app/src/lib/api-documentation.ts#L2770) and [shared page](https://github.com/SemiAnalysisAI/InferenceX-app/blob/cc5d87cd37a3a502ce63b58c8985fa034fa07965/packages/app/src/components/api-documentation/api-reference-page.tsx#L105) support this small onboarding change.

## Phase 1: Establish the small change against current code

- [ ] Record the current base commit, #901 head, shipped #938 state, production OpenAPI retrieval date, and npm registry lookup result in implementation notes.
- [ ] Create a dedicated `codex/inferencex-api-skill` branch/worktree from refreshed `origin/master`, after checking that the proposed branch name is unused. Keep this unrelated audit checkout intact.
- [ ] Bring forward only #901's package skeleton, installer, API skill, and required supporting files. Select a cutover that preserves the broader views work for its own review.
- [ ] Remove unshipped `/api/v1/views/*` recipes from the release content; link only to implemented public operations.
- [ ] Confirm the intended release version is unused, the package owner can publish under `@semianalysisai`, and the package metadata follows the repository's existing license.

**Deliverable:** A bounded package change whose diff contains one API skill and no prerequisite views API or visualization implementation.

## Phase 2: Write the public API and PowerX workflow

- [ ] Make the skill begin with the production API reference and OpenAPI URLs. Require checking current operation parameters before constructing a request.
- [ ] Document a short sequence: discover supported values and dates; choose the requested benchmark scope; retrieve rows; inspect measured-power validity and provenance; export the selected result with the request URL and retrieval timestamp.
- [ ] Add one copyable benchmark recipe, one valid PowerX extraction recipe, and one no-data/error recipe. Use the exact live contract, model identifiers, units, response fields, and validity predicates established by the API audit.
- [ ] Explain measured energy/power versus provisioned or assumed values. Preserve the actual response's nulls and exclusion reasons; do not substitute zero or relabel an assumption as a measurement.
- [ ] Preserve enough row identity and run provenance to reproduce the selection. Put model, hardware, configuration, workload, concurrency, timestamp/date, units, and validity beside an exported comparison where the API provides them.
- [ ] State when results are historical, and when no new runs were performed. A valid row does not automatically establish a representative performance or energy win.
- [ ] Keep all necessary instructions inside the package or reachable public documentation. The skill must work without a local InferenceX checkout, private database URL, or maintainer token.
- [ ] Implement one `scripts/export-powerx.mjs` using Node 24's standard library, so users of the npm installer need no Python environment. Request benchmark rows using the documented model and `powerValid=strictV2`; apply `benchmark_type`, `isl`, and `osl` selection locally because the ordinary benchmarks route does not implement a sequence query filter. Do not send `powerValid` to history, which does not support it.

**Deliverable:** One concise `SKILL.md`, one PowerX cookbook, and one tested Node exporter, each checked against current public responses.

### Export example contract

Proposed interface, to be exercised from the installed skill directory:

```bash
node scripts/export-powerx.mjs \
  --model DeepSeek-V4-Pro --date 2026-09-04 \
  --isl 8192 --osl 1024 --format csv --output powerx.csv
```

Require `--model`, `--isl`, and `--osl`; default format to CSV, permit JSON, and record when the date is omitted and the request uses latest data. Scope the first executable to observed single-turn snapshots. An optional `--raw-model` can select an exact returned model key inside a display bucket. Treat the shown date/counts as a research example, not a fixed fixture asserting production data never changes.

Construct URLs with the standard URL APIs. Fetch the strict response, recheck `metrics.power_valid === 1 && metrics.power_metric_schema_version === 2`, then filter `benchmark_type === 'single_turn'` and exact numeric ISL/OSL. The standard `fetch` implementation handles compressed HTTP responses. Keep error handling bounded: non-2xx responses, malformed JSON, and an unexpected response shape fail with a clear message and nonzero status, without creating a successful empty export.

CSV should include the request URL and retrieval time; requested display model/date; returned raw model and benchmark ID; hardware, framework, image, precision, speculative method, workload and concurrency; original topology/config fields; numeric validity/schema; documented watts/joules fields; and original date/run URL plus separate curve metadata. JSON can retain the selected original rows and query metadata, including optional nested audit/workers when present. Use blank CSV cells or JSON null/absence for missing metrics, preserve true zero, and do not emit non-finite measurements. Print selected/returned counts and returned model keys as a short coverage summary.

Benchmark request enums use display names, while availability/results contain raw model keys. One display bucket can include several releases: the current source maps GLM-5 to both `glm5` and `glm5.1`, for example. Do not ship a copied static alias table or label every returned row as the requested exact release; retain the raw model, expose it in the summary, and scope further when required. Availability indicates benchmark presence rather than power eligibility. [Authoritative model mapping](https://github.com/SemiAnalysisAI/InferenceX-app/blob/cc5d87cd37a3a502ce63b58c8985fa034fa07965/packages/constants/src/models.ts#L9)

The unavailable-data recipe first reports **No strictV2 rows matched this scope**. It may then make one unfiltered request with the same model/date and local scope to distinguish no matching benchmarks from invalid, legacy/unverified, missing, or unsupported-schema power data. An empty strict result alone cannot make that distinction. Historical queries remain available through the general API skill, but history uses local strict validation because its handler has no `powerValid` parameter. [History handler](https://github.com/SemiAnalysisAI/InferenceX-app/blob/cc5d87cd37a3a502ce63b58c8985fa034fa07965/packages/app/src/app/api/v1/benchmarks/history/route.ts)

### Export regression cases

| Case                                                                      | Expected result                                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Numeric `power_valid=1`, schema `2`                                       | Eligible for strict selection.                                                             |
| Strings, booleans, explicit invalid, absent verdict/schema, or schema `3` | Excluded; no coercion or future-version assumption.                                        |
| Mixed single-turn/agentic rows or different ISL/OSL                       | Export only the requested single-turn workload.                                            |
| Display bucket contains several raw model keys                            | Preserve keys and requested bucket; exact raw-model filter restricts output when supplied. |
| Missing optional metric versus numeric zero                               | Blank/null versus zero remains distinct.                                                   |
| Producer ID absent, curve ID present                                      | Producer ID remains absent; both provenance families stay separate.                        |
| Numeric-looking string ID above `Number.MAX_SAFE_INTEGER`                 | Preserve the exact string; do not round or coerce it through a JavaScript number.          |
| Empty strict selection                                                    | Honest empty-scope summary; no claim that all underlying benchmarks are absent.            |
| Invalid model/filter, HTTP failure, malformed body                        | Actionable failure, nonzero status, no successful empty CSV.                               |
| CSV comma, quote, newline and Unicode                                     | Correct escaping and round-trippable values.                                               |
| As-of date differs from source measurement date                           | Export both; do not label old observations as newly measured.                              |

Use small representative local fixtures for deterministic tests. Use public GETs only for bounded acceptance checks; live row counts are evidence, not immutable assertions.

## Phase 3: Make the existing installer dependable

Use the existing `install`, `list`, `--target`, `--dir`, and `--force` interface from #901. Avoid adding package-selection machinery when the release bundles exactly one skill.

- [ ] Map both `--target codex` and `--target agents` to `.agents/skills`; keep `--target claude` at `.claude/skills`. Keep explicit `--dir` for users who need another supported location. Current Codex documentation lists `.agents/skills` and `~/.agents/skills`; Claude Code documents `.claude/skills` and `~/.claude/skills`. [Official OpenAI documentation](https://learn.chatgpt.com/docs/build-skills), [Claude Code documentation](https://code.claude.com/docs/en/skills)
- [ ] Set the package's declared and tested runtime to Node 24, matching the repository and CI baseline, and update help/README accordingly. This corrects #901's Node `>=18` claim while it uses `import.meta.dirname`, which Node added in 20.11.0/21.2.0. [Node.js module documentation](https://nodejs.org/api/esm.html#importmetadirname)
- [ ] Ensure `list` reports exactly `inferencex-api`, and installation copies every referenced file.
- [ ] Keep an existing skill unchanged without `--force`; report what happened. Test the explicitly requested merge-and-overwrite behavior and preservation of unrelated neighboring skills. Document that this behavior does not remove obsolete files; do not claim a clean replacement or introduce deletion semantics silently.
- [ ] Reject invalid commands, unknown targets, and options missing values with a nonzero exit status and useful help. `--help` and `list` must not write files.
- [ ] Test a destination containing spaces and invocation from outside the monorepo. Run on the declared Node 24 baseline.

**Deliverable:** A dependency-free installer with tests exercising observable files, messages, exit statuses, and compatibility.

## Phase 4: Validate the actual package artifact

Set the package's `test:unit` script to `node --test test/*.test.mjs`; the root unit-test runner already discovers workspace test scripts. Extend the CI path filter so package-only changes invoke it. Proposed focused command from `packages/skills` after implementation:

```bash
node --test test/*.test.mjs
```

Expected: installer behavior passes in disposable directories; exactly one valid skill exists; all package-local references resolve; cookbook assertions match the established API contract.

The [workspace runner](https://github.com/SemiAnalysisAI/InferenceX-app/blob/cc5d87cd37a3a502ce63b58c8985fa034fa07965/scripts/run-workspace-script.ts#L36) already handles package scripts. The [unit workflow path filter](https://github.com/SemiAnalysisAI/InferenceX-app/blob/cc5d87cd37a3a502ce63b58c8985fa034fa07965/.github/workflows/tests-unit.yml#L7) currently enumerates other packages and needs the skills entry. No new test framework is required. Content checks should validate usable packaging/references, not pin wording or duplicate the live endpoint catalogue in assertions.

From `packages/skills`, inspect packaging before creating the release candidate:

```bash
npm pack --dry-run --json
npm pack --json
```

`npm pack` produces the distribution tarball; `--dry-run` and `--json` support review of the proposed contents. Record the produced filename and checksum. Inspect the tarball's file list and run its extracted executable from a disposable directory. The artifact must include the installer, metadata, README/license material, and only the API skill with its references. It must exclude the other three skills, private local files, and a dependency on source files outside the tarball. [npm pack documentation](https://docs.npmjs.com/cli/v11/commands/npm-pack/)

Before publication, test npm's actual binary resolution using that local tarball from outside the workspace. Substitute the real absolute tarball and disposable destination paths:

```bash
npm exec --yes --package /absolute/path/reviewed-package.tgz -- \
  inferencex-skills install --dir /absolute/path/temporary-project/.agents/skills
```

Verify the installed skill and run its exporter. This exercises the package's `bin` wiring and bundled paths before publication, in addition to directly testing the extracted executable.

Run the existing required repository checks for the resulting change, including unit tests and local E2E smoke coverage required by `docs/testing.md`. If API onboarding or contracts change, run their targeted tests and the API documentation synchronization guard. A package-only patch still needs its installer and artifact checks; passing frontend checks does not exercise those paths.

Record `bun run typecheck`, `bun run lint`, `bun run fmt`, `bun run check:typography`, `bun run test:unit`, and `bun run test:e2e`. Run the targeted API documentation Cypress spec for the new onboarding and the existing API route-catalog guard. Pure onboarding does not require changing a handler digest or claiming an API contract change. Review added Chinese copy under `docs/chinese-copy.md`, with Claude's advisory fidelity/naturalness pass and maintainer editorial review when preparing the implementation PR.

**Deliverable:** A reviewed tarball, file manifest, exact version and checksum, and recorded test results.

## Phase 5: Exercise the skill in clean agent sessions

Use temporary test projects, with only the released candidate skill installed for the tested agent. Agent evaluation is a later implementation validation task; no installation is performed while writing this plan.

| Scenario                           | Required evidence                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Benchmark lookup                   | Agent chooses documented parameters and reports identifiable source rows with the request URL                         |
| PowerX export                      | Export contains the intended measured fields, units, validity and provenance; selected values match the HTTP response |
| Invalid or unavailable data        | Agent preserves nulls/empty results or reports the documented error without inventing measurements                    |
| Measured versus assumed comparison | Agent names the metric family and does not mix provisioned assumptions with measured results                          |
| Repeat the task                    | Saved request and selected scope reproduce the export, subject to clearly identified live-data updates                |

Run these scenarios in both Codex and Claude Code. Save the prompts, request URLs, package version, generated exports, and short pass/fail notes. Structural skill validation is necessary, but successful task execution is the release criterion.

**Deliverable:** A compact acceptance record showing the two supported agents can perform the public extraction workflow.

## Phase 6: Add bilingual onboarding and prepare the release

- [ ] Add a small Agent skill section to `api-reference-page.tsx`, using its EN/ZH copy mechanism and existing `CopyableCodeBlock`, and update the package README. Keep PowerX terminology and examples aligned across both languages. Cover the section in the existing API documentation E2E spec.
- [ ] Use the same package name and command shape everywhere. Until publication is verified, label the commands as a release candidate or upcoming release.
- [ ] Record the selected version, source commit, tarball checksum, test results, install targets, and maintainer release ownership.
- [ ] Prepare a short bilingual PR description explaining reuse of #901, the one-skill scope, the shipped API dependency, and validation. Follow repository commit translation and Chinese-copy review requirements.
- [ ] Stage the final website onboarding activation until after the npm version is publicly retrievable, or publish the reviewed tagged package before deploying the website when the established release process permits it. Do not expose a working-looking copy command before publication or add a runtime feature flag for this sequencing.

Preferred one-PR sequence: complete code/docs review and checks, prepare the exact tarball from the reviewed commit, publish that artifact once authorized, verify its pinned public install, then merge/deploy the same PR's onboarding. If repository release policy requires merging package code before publication, activate the prepared onboarding in a small follow-up commit after publication. This ordering is a release coordination choice, not an excuse to publish an unreviewed package or leave a broken command on the site.

Proposed PR title: `feat(skills): add installable InferenceX API skill / 新增可安装的 InferenceX API 技能`. Keep commit subjects concise and put their Chinese translations in commit bodies. Before starting implementation, coordinate the extraction boundary with #901 so a later merge keeps the focused package changes instead of restoring its old `/views/*` guidance.

Proposed user commands **after a tested version is published**; replace `<version>` with that exact version:

```bash
npx @semianalysisai/inferencex-skills@<version> install --target codex
npx @semianalysisai/inferencex-skills@<version> install --target claude
```

Show an explicit upgrade command using the chosen new version and the existing `--force` behavior, including what it replaces. npm runs this package's executable; installing an arbitrary package alone does not register a skill in an agent's supported directory. [npm exec documentation](https://docs.npmjs.com/cli/v11/commands/npm-exec/)

## Phase 7: Publish and verify public availability

Publication is a deferred external action. Once the implementation, tarball, and validation are ready, obtain authorization for the identified package/version if it has not already been explicitly provided. No approval is requested at this planning stage.

The release owner verifies account/organization permission and publishes the exact approved tarball with public access: `npm publish /absolute/path/reviewed-package.tgz --access public`. Passing the reviewed archive avoids repacking the current working directory after review. Scoped packages require explicit public visibility; direct publishing also has npm account authentication requirements. Use the repository's established release mechanism if one exists while preserving the reviewed artifact identity. [npm scoped public-package documentation](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/), [npm publish documentation](https://docs.npmjs.com/cli/v11/commands/npm-publish/)

After publication, query the exact version through the public npm registry:

```bash
npm view @semianalysisai/inferencex-skills@<version> name version dist.tarball dist.integrity --json --registry=https://registry.npmjs.org
```

Expected: the intended package and version exist, with downloadable distribution metadata. Check without relying on private registry credentials, download and test that published artifact, and run the documented version-pinned installation in clean Codex and Claude projects. Verify their skill discovery and one extraction task. [npm view documentation](https://docs.npmjs.com/cli/v11/commands/npm-view/)

Mark onboarding as available only after those checks. If the published artifact needs correction, release a new version; npm does not permit reusing a published package-name/version combination. [npm publish documentation](https://docs.npmjs.com/cli/v11/commands/npm-publish/)

**Deliverable:** A publicly retrievable version, verified documented install commands, and a release record tying the npm artifact to its source and acceptance results.

## Completion criteria

- One published API skill uses the shipped public API and includes an accurate PowerX cookbook.
- The package installs to supported Codex and Claude Code directories from outside the repository.
- The tarball and the public registry artifact contain the same intended release content.
- Both agents complete the benchmark, PowerX, and missing-data scenarios with reproducible provenance.
- English and Chinese onboarding agree with the released behavior.
- The broader #901 work remains independently understandable and is not silently included in this release.

## Implementation handoff and remaining release facts

Package/installer/tests and skill/cookbook/exporter work can run in parallel with explicit file ownership after the one-skill contract is agreed. Bilingual onboarding follows the finalized command/example. One integration owner runs artifact tests, independent agent acceptance, and release coordination.

The only release facts intentionally left for the implementation stage are current npm ownership/access, the unused exact package version, maintainer-approved sequencing, and confirmation of actual Codex/Claude execution in available test environments. They do not prevent writing or testing the local package. A registry 404 alone does not establish scope ownership or permission to publish. Refresh PR heads and production capabilities before implementation; the baseline above is timestamped evidence.

All implementation tasks remain pending. This planning run changed only this Markdown document and did not install, publish, or modify the API/package.
