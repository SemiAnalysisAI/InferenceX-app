# Immutable measurement publication

[中文](./measurement-publication_zh.md)

Phase 1 readers accept a version-1 source measurement receipt produced by the independently trusted InferenceX hosted issuer. A later publication record references the receipt and adds merge, changelog, ingest and public-app revisions. The source receipt never changes when staging becomes production. This implementation is a reader prerequisite; local tests do not establish deployed-reader or GPU qualification.

`prepare-receipt-transport.ts` validates the source artifact inventory independently. Any `native-execution-*` upload makes a receipt mandatory, including failed native executions. The trusted dispatcher also supplies `receipt-required`; omission of native evidence cannot qualify a run. Legacy inventory without the native capability retains its weaker selection behavior, and an already accepted run cannot later bypass its receipt via legacy ingest.

The app repository must configure `INFX_RECEIPT_ISSUER_SHAS` as a comma-separated allowlist of reviewed issuer revisions, and `INFX_RECEIPT_ISSUER_WORKFLOW` as the exact `.github/workflows/<name>.yml` path. Keep prior accepted revisions while their receipts remain supported. The receiver checks successful completed issuer runs, exact repository/run ownership, API digest, ZIP bytes and member paths. Payloads cannot choose arbitrary download URLs or trusted code. Dispatch publication only after its issuer finishes successfully.

Receipt reads use the existing repository-scoped `INFX_MAIN_PAT` with read access to source Actions runs and artifacts. Keep it confined to the steps that need it; moving secrets into a protected GitHub Environment requires migrating the stored credential and its policy, not adding an empty workflow `environment`. The app's configured zizmor check passes; the separate auditor persona additionally reports this existing credential architecture, including the new receipt consumers. These advisories are not suppressed.

Dispatch fields are `receipt-required`, `receipt-artifact-id`, `receipt-artifact-sha256`, `receipt-sha256`, `receipt-issuer-run-id`, and `receipt-issuer-sha`. ZIP and JSON digests are distinct. A receipt ZIP contains `receipt.json`. Production/recovery adds `publication-artifact-id`, `publication-artifact-sha256`, `publication-sha256`, `publication-issuer-run-id`, and `publication-issuer-sha`; that later ZIP contains `publication.json`. Both staging and ingest workflows forward these fields. Staging checks transport before any optional database reset.

The receiving workflow derives `PUBLICATION_REQUIRED` from its actual database target. Native production requires a later record even when source and merge run IDs are equal; staging can use only the source receipt. Issuers must be completed successful `workflow_dispatch` runs on `main`, and the receiver independently verifies the original source attempt and head through the API. In GitHub Actions, the record's `ingest_sha` must match the executing app checkout's `GITHUB_SHA`. Pin the source repository's `INFX_PHASE1_READER_REVISION` to that deployed app commit before issuing publication records, and retain deployment evidence that the public app uses the recorded `app_sha`.

The reader uses separately versioned `aiperf-1.4`, `agentx-v1` and publication contract 1. Unsupported required versions fail before import. Every point binds its original execution/attempt, prepared bundle, native manifest, physical topology, canonical model/hardware/framework/precision, required metrics, full dataset identity and exact artifact/member references. Normalized AgentX JSON and per-job raw lm-eval results plus `meta_env.json` are supported. Evaluation requires complete `(task, doc_id, filter)` coverage. Both live preview and stored document-level samples select strict-match independent of line order and reject conflicting copies. Aggregate metadata maps to one physical serving role with compatibility worker counts 0/0.

Artifacts are downloaded with argv-based `gh` calls into private temporary ZIP files and extracted under numeric ID roots. Archive and member hashes use bounded reads. A Node/Bun worker streams every ZIP member once for validation, then streams extraction and rechecks the accepted member set; large trace payloads are never retained together in memory. Validation rejects escaping paths, links, duplicate normalized names, file/directory collisions, overwrites and changed member sets. Checked compatibility views retain existing consumer discovery names. All snapshot bytes and normalized requirements are verified before the first database write.

Receipt ingestion selects benchmark JSON and evaluation samples from the receipt's exact member bindings. Execution metadata and other JSON sidecars are retained as evidence without entering benchmark row mapping. Both normalized aggregate evals and raw lm-eval outputs persist their explicitly bound strict-match samples; sample attachment does not depend on directory or timestamp naming conventions.

An `evals-only` changelog cannot narrow a receipt that requires throughput points: the reader rejects it before database writes. Before refreshing the published curve or marking a snapshot complete, every accepted benchmark file must return the receipt's exact point count from database inserts, including existing rows on replay. Per-point purge skips therefore leave the snapshot incomplete.

Apply migration `016_measurement_snapshots.sql` before enabling receipt ingestion or declaring the deployed reader ready. The table retains the compact receipt and binds each source repository/run/attempt to one accepted snapshot. An interrupted progressive import remains `writing` and resumes only that same receipt; successful replay remains stable. Replacing measurement bytes requires a separately versioned source execution. Execution rollback does not reverse prior database writes. Preserve a compatible reader for all retained receipt versions.

## Migration-only readiness

The [Migrate Database workflow](../.github/workflows/migrate-database.yml) applies pending checked-in migrations through `bun run admin:db:migrate --yes`, using only the existing writer secret for the explicitly selected `staging` or `production` target. It preserves the database and existing measurements; it does not reset a Neon branch, ingest a run or refresh public caches. The exact `expected-sha` must match the workflow commit before the migration step can access a database credential.

After this workflow lands on `master`, dispatch staging first and inspect its successful verification artifact, then repeat for production with the same reviewed app commit:

```bash
gh workflow run migrate-database.yml --repo SemiAnalysisAI/InferenceX-app --ref master \
  -f database-target=staging -f expected-sha=REVIEWED_MASTER_SHA
gh workflow run migrate-database.yml --repo SemiAnalysisAI/InferenceX-app --ref master \
  -f database-target=production -f expected-sha=REVIEWED_MASTER_SHA
```

The read-only verifier checks that migration `016` is recorded, the receipt table has its required column types and nullability, and its primary key binds source repository/run/attempt. A successful `measurement-schema-<target>-<run>-<attempt>` artifact contains `migration-report.json` with the target, exact app SHA, workflow identity and verified schema; it contains no connection string or measurement data. Missing or incompatible schema fails without producing a success report. Keep both successful run links and artifacts as readiness evidence.

Normal app merges trigger Vercel deployment separately. Keep native receipt ingestion disabled until production deployment and migration verification both succeed for the reviewed revision, then set `INFX_PHASE1_READER_REVISION` to that deployed app SHA and configure the issuer allowlist. A successful preview or migration-only run alone does not establish publication readiness. The new workflow is not dispatchable until it exists on the default branch.

After cache refresh, the workflows execute the read-only `packages/db/src/verify-measurement-publication.ts <public-origin> <verification.json>`. It compares exact-run and latest curve metrics/topology with the accepted snapshot, checks eval summary visibility and strict sample counts, and verifies trace-detail availability. It uses `INGEST_ARTIFACTS_PATH` and the receipt environment emitted by transport. Retain its report alongside existing PowerX and database diagnostics. Run-specific verification does not silently imply that every fleet lane is qualified.

Local regression coverage includes Python/TypeScript receipt interoperability, unsafe archives, omitted/wrong-owner exact IDs, untrusted issuers, rehashed semantic corruption, full sample/filter coverage, actual PGlite partial-import/replay guards and a fresh-process verifier against controlled HTTP APIs. Deployment, the complete H100 eight-point/c28 run, staging and post-merge production verification remain explicit release steps.
