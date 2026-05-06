-- ============================================================
-- EVAL SAMPLES — per-prompt eval results
-- ============================================================
--
-- One row per individual sample in an lm-eval run (e.g. one of ~1.3k gsm8k
-- prompts). Sourced from samples_<task>_*.jsonl inside the per-config eval ZIP
-- artifact. Backfilled from GCS via ingest-gcs-backup.ts; new runs flow in via
-- ingest-ci-run.ts. Inspired by the vLLM eval dashboard PoC
-- (credit: @khluu, @simon-mo, @robertgshaw2-redhat).
--
-- prompt/target/response/passed/score are extracted at ingest time so the
-- API route doesn't have to re-parse jsonl on every request. `metrics` keeps
-- the full per-sample metric dict so the UI can switch which metric drives
-- "passed" without re-ingest. `data` keeps non-promoted lm-eval fields
-- (arguments, resps, doc) for forward-compat with new tasks.

create table eval_samples (
  id              bigserial primary key,
  eval_result_id  bigint    not null references eval_results(id) on delete cascade,
  doc_id          integer   not null,
  prompt          text,
  target          text,
  response        text,
  passed          boolean,
  score           numeric,
  metrics         jsonb,
  data            jsonb,

  constraint eval_samples_unique unique (eval_result_id, doc_id)
);

create index eval_samples_result_idx        on eval_samples (eval_result_id);
create index eval_samples_result_passed_idx on eval_samples (eval_result_id, passed);
