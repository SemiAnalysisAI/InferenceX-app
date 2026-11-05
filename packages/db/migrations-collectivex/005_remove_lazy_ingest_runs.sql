-- Remove the runs the retired lazy GitHub Actions ingest stored, and keep them out.
--
-- Those rows are keyed by GitHub Actions run id (>= 10^10), committed-results runs by
-- epoch seconds (< 10^10 until the year 2286). Left in place, every legacy row would
-- outrank every committed-results run under `ORDER BY run_id DESC`, so "latest" would
-- stay a stale CI sweep forever. Deleting cascades to their cx_run_docs. The archive of
-- the old contents is a pg_dump taken before this runs (see docs/collectivex.md).
--
-- The CHECK makes the id range part of the schema, so a legacy-shaped id can never be
-- stored again. It matches MAX_COMMITTED_RUN_ID in
-- packages/db/src/collectivex/committed-results.ts.

delete from cx_runs where run_id >= 10000000000 or run_id <= 0;

-- Documents whose run is gone (none are expected: the foreign key cascades).
delete from cx_run_docs d where not exists (select 1 from cx_runs r where r.run_id = d.run_id);

alter table cx_runs
  add constraint cx_runs_committed_run_id check (run_id > 0 and run_id < 10000000000);

comment on table cx_runs is
  'One row per InferenceX commit on main whose collectivex/results/ holds measured results; run_id = committer epoch second, raised past the previous results commit''s id on ties.';
