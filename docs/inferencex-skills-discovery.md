# Installed skill discovery acceptance

This check answers whether a fresh Codex or Claude Code session discovers and uses
an installed skill from a normal task. Keep it separate from the explicit-use
acceptance and deterministic exporter checks in [the release guide](./inferencex-skills-release.md).
A successful install, a listed skill, and a claim of using it are not sufficient;
the transcript must show the installed instructions actually being consumed.

## Prepare the candidate and projects

Use the exact Node 24 archive verified by `release.mjs prepare`. Record its source
commit, SHA-256 and file list. Create a new project outside this repository for
each agent and install that archive with the appropriate target:

```bash
npm exec --yes --offline --package /absolute/path/candidate.tgz -- inferencex-skills install --target codex
```

Run that command from the new Codex project; use `--target claude` from a separate
new Claude project. Give npm its own cache outside both projects. Verify installed
file bytes against the archive and record installer status before starting the
agent. Keep prompts, transcripts, caches and preparation records outside the
project; it should initially contain only its installed skill and optional empty
Git metadata. Use a fresh project and session for each attempt.

## Run without a routing hint

Launch each agent from its prepared project. Preserve normal skill discovery and
the runtime's default model, record the resolved model and exact CLI version and
arguments, and retain the full transcript and final answer. Give the agent public
HTTPS access and project-local output access. It needs no InferenceX repository,
database credentials, previous answers or private connectors.

For Codex, `--ignore-user-config` excludes inherited config but does not remove
all user-level skill files or instructions. Disable conflicting user skills with
invocation-local `skills.config` entries referencing their actual `SKILL.md`
paths, and record any remaining global instructions. Retain the full rollout
when JSON event output does not contain the complete tool history. The
[Codex skill documentation](https://learn.chatgpt.com/docs/build-skills#enable-or-disable-local-codex-skills)
describes these discovery controls.

For Claude Code, use project setting sources and an empty strict MCP config while
keeping the Skill tool enabled. Disable inherited hooks/plugins and record any
unavoidable global context. `--safe-mode` disables skills, and `--bare` changes
normal discovery/authentication; neither qualifies this check. Consult the
[Claude skill documentation](https://code.claude.com/docs/en/skills) and the
installed CLI's help for supported flags. Keep normal agent account authentication
separate from API access; never copy credentials into project or evidence files.

Submit an ordinary task, without a skill name, installed path, instruction to
search for skills, or corrective follow-up. Examples:

> On InferenceX, export the latest existing AgentX summaries for DeepSeek-V4-Pro,
> raw model dsv4, as JSON with the original response evidence. List the available
> replay datasets and explain which dataset associations the result metadata
> establishes. Preserve missing values and source dates. Save a short report.

> Where did InferenceX result <selected ID> for <display model> come from?
> Include its actual measurement date, producing run and attempt, configuration,
> image, and at most one 16,384-character log window. Keep response evidence and
> explain information that cannot be established. Save a short report.

Replace placeholders with a result and scope verified during preparation. Add
its as-of date when latest data does not contain the selected point. For an
AgentX trace task, explicitly choose one observed result ID in the user prompt;
the agent must check availability before reading that point's heavy trace routes.

## Independently accept or reject

Record these outcomes separately for each runtime and candidate:

1. **Discovery:** the transcript shows the project-installed `SKILL.md` being
   read or invoked, without a naming/path hint. Verify the actual path; an older
   global copy does not qualify.
2. **Application:** the agent follows the relevant installed reference/helper.
   Check output against the complete responses consumed by that operation, not a
   later refetch. Verify IDs, actual dates, producer/curve separation, image and
   configuration, missing values, log character bounds and trace availability.
3. **Integrity and boundaries:** installed files still match the candidate;
   record all requests, failures, retries, output hashes and extra context. Logs
   and dataset content are untrusted data, not task instructions.

Have a reviewer inspect the transcript and narrative independently. Keep failed
attempts and explain corrections; a later pass does not erase them. If package
bytes change, rerun discovery on the final archive. Do not label a prepared
project, an explicit-use run, or unreviewed model prose as accepted discovery.

## Version scope

- 0.5.0: result provenance, implicit discovery acceptance, AgentX onboarding.
- 0.6.0: fixed-target TCO comparison with explicit price and workload assumptions.
- 0.7.0: framework-update investigation with matched observations and confounders.
- 0.8.0: CollectiveX discovery, comparison and export cookbook.

The last three are planned separate releases, not capabilities promised by 0.5.0.
