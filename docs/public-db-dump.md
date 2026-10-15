# Public Weekly Database Dump

`.github/workflows/db-backup.yml` publishes a `db-dump/YYYY-MM-DD` GitHub release every Monday at 00:00 UTC. It is a public data product for people who want to query InferenceX results themselves, not the disaster-recovery backup; production recovery relies on Neon's own backups.

## What the dump contains

The dump carries what end users need to reproduce published results, and leaves out bulk payloads whose value is debugging.

| Included                                                                                                                                                               | Why                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Every table's schema                                                                                                                                                   | Restores into a database that matches production                                                                             |
| `configs`, `benchmark_results`, `workflow_runs`, `availability`, `run_stats`, `eval_results`, `changelog_entries`, `datasets`, `run_datasets`, `dataset_conversations` | Every number behind the dashboard, history, Pareto, TCO, reliability, evaluation and changelog views (about 0.15 GB of text) |
| `gpu_metric_series`, `gpu_metric_samples`, `benchmark_result_gpu_metrics`                                                                                              | PowerX per-GPU telemetry (about 2.3 GB); Neon holds the only other copy                                                      |
| `agentic_trace_replay` derived columns (`aggregate_stats`, `chart_series`, `request_timeline` and size metadata)                                                       | AgentX per-point views (about 15 GB); computed by our ETL, so the raw artifacts alone cannot reproduce them                  |

| Left out (schema only)                                                                                          | Why                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Raw `agentic_trace_replay` payloads (`profile_export_jsonl_gz`, `server_metrics_json_gz`, `server_metrics_csv`) | About 174 GB as dump text; single rows exceed pg_dump's 1 GiB per-row COPY limit, which broke the Oct 5 and Oct 12, 2026 runs |
| `server_logs`, `server_log_files`, `benchmark_server_logs`                                                      | About 224 GB of engine logs, debugging only, and they carry internal hostnames and paths                                      |
| `eval_samples`                                                                                                  | About 26 GB of per-question prompts and responses; the scores are in `eval_results`                                           |
| `user_feedback`                                                                                                 | Private                                                                                                                       |

Sizes are uncompressed dump text measured in October 2026. The raw trace and server-log artifacts are also mirrored in `gs://inferencemax-gha-backup`.

## How it is produced

`.github/scripts/db-dump.sh` is the single implementation of export, restore and check, and ships as a release asset.

- **Export.** One transaction exports a snapshot (`pg_export_snapshot`). `pg_dump --snapshot` writes the core archive with the excluded tables' data skipped, and a second session imports the same snapshot to `\copy` the derived `agentic_trace_replay` columns. A shared snapshot means every `benchmark_results.trace_replay_id` resolves on restore. A heartbeat sends `select 1` on the exporting session every 5 seconds while the readers run, because Neon ends sessions idle in a transaction after 5 minutes.
- **Assets.** `inferencex-DATE.dump.zst.partNN` (pg_dump custom format) and `inferencex-DATE.agentx.copy.zst.partNN` (COPY text), zstd `--long=27`, split at 1900 MiB to stay under GitHub's 2 GiB asset limit, plus `db-dump.sh` and `SHA256SUMS`.
- **Restore.** `pre-data`, then `data`, then the AgentX COPY, then `post-data`, so foreign keys are added after their rows exist. Only `benchmark_results_server_log_id_fkey` is skipped, because `server_logs` has no rows. The script fails if that constraint is missing from the archive, so a schema change cannot silently change what is skipped.
- **Verification.** Before anything is uploaded, the dump job restores the dump with the same script into a throwaway PostgreSQL 18 container and runs `check`. `check` requires rows in the core, PowerX and AgentX tables, no rows in the excluded tables, and no raw trace payloads. Row counts go to the job summary.
- **Failure alerts.** A failed or cancelled run posts to the same Slack channel as ingest failures through `SLACK_WEBHOOK_URL`.
- **Dry runs.** `gh workflow run db-backup.yml -f publish=false` runs export and verification without creating a release.

## Changing the schema

- A new table is included by default. If it holds bulk payloads, add it to `EXCLUDED_TABLES` in the script.
- A new derived column on `agentic_trace_replay` must be added to `AGENTX_COLUMNS` to be published.
- A new foreign key into an excluded table makes the restore fail in the verify step; skip it in the script the same way as `SKIPPED_FOREIGN_KEY`.
