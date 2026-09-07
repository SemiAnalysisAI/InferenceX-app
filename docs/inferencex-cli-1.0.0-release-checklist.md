# InferenceX CLI 1.0 release checklist

The 1.0 candidate adds one `inferencex` entry point for discovery, six evidence
workflows, offline verification, and installation diagnostics. Publication is a
separate operation after candidate review. The website remains pinned to the last
anonymously verified public version until that operation succeeds.

## User workflows

1. Discover a model, date, and observed configuration; export PowerX or AgentX
   observations into one new evidence directory.
2. Inspect one result's producer or compare TCO, framework observations, or
   CollectiveX runs, retaining the exact source responses and domain limitations.
3. Move a saved directory to another machine, verify it offline, and apply an
   explicit hardware or comparable-pair requirement for CI.

The [CLI reference](../packages/skills/skills/inferencex-api/references/cli.md)
contains commands and examples. [Compatibility](./inferencex-cli-compatibility.md)
defines exit codes, fixed CSV columns, JSON evolution, and legacy migration.

## Candidate evidence

- [ ] Regenerate `integrity.json` with `update-integrity.mjs` after packaged file
      edits. Commit it with the package source using normal hooks and record the
      reviewed commit; `release.mjs prepare` rejects a stale inventory.
- [ ] Pass the Node 24 packed suite, schema consumers, independent Python verifier,
      repository checks, and the required Linux/macOS × Node 24/26 matrix.
- [ ] Prepare one Node 24 archive with `release.mjs prepare`; retain `release.json`,
      its file inventory, SHA-256, and npm integrity. Verify with `release.mjs check`.
- [ ] Install that exact archive anonymously into clean projects for both targets.
      Discover a live scope and verify six formal result families against the saved
      response bytes, including valid empty evidence and an explicit policy failure.
- [ ] Run each maintained natural-language case in a fresh Codex and Claude
      project: six live cases and the offline six-family matrix. Retain the original
      prompts, transcripts, answers, failures, and independent assessor outcomes.
      An exit code alone does not establish implicit discovery or correct prose.
- [ ] Assemble the reviewed qualification JSON from the four actual Actions job
      records and fourteen assessed native cases. All entries must refer to the
      accepted archive; validate it with `release-summary.mjs check-qualification`.

Keep detailed captures outside the npm package. A failed attempt remains evidence;
after a fix, rerun affected checks and every gate invalidated by changed archive
bytes. Record missing or failed platform jobs as missing or failed.

## Ordered release

- [ ] Complete PR review and required checks, then obtain release direction.
- [ ] Reprepare on the reviewed default-branch source and require the accepted
      archive SHA-256. A changed archive needs renewed acceptance.
- [ ] Dispatch `publish-skills.yml` with the exact version, reviewed hash, and
      qualification JSON. Its prepublication gate checks the evidence declaration
      before the OIDC npm publish step.
- [ ] Pass anonymous pinned public installation, registry identity, live behavior,
      and saved-bundle verification against the published archive.
- [ ] Retain the immutable versioned archive, release manifest, and sanitized
      release summary as GitHub release assets. Detailed Actions captures expire
      after 30 days; native transcript retention remains the maintainer's duty.
- [ ] Update both website languages' installation pins and activate the bounded
      public API monitor against the verified stable version.

See [release instructions](./inferencex-skills-release.md) for commands and the
qualification trust boundary. Windows, benchmark execution, exhaustive trace
archives, cryptographic source authenticity, and causal regression verdicts are
outside this release's qualification scope.
