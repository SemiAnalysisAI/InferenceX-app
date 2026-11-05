-- CollectiveX results no longer live in the InferenceX repo: an operator uploads a
-- results/ directory (cases.json + <sku>/<case_id>.json) with
-- `bun run admin:db:ingest:collectivex --dir <path>`, and each upload is a new run laid
-- over the latest stored one. Only the table descriptions change; the schema, including
-- migration 005's run_id CHECK, stays as is.

comment on table cx_runs is
  'One row per uploaded CollectiveX results directory, merged over the previous latest run; run_id = upload time in epoch seconds, raised past the highest stored id.';
comment on table cx_run_docs is
  'The <sku>/<case_id>.json result documents of each cx_runs row, verbatim.';
