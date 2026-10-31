-- CollectiveX runs are now the benchmark repo's committed results, one row per
-- InferenceX commit that touched collectivex/results/ on main.
--
-- run_id is that commit's committer time in epoch seconds (still monotonic with
-- history, so "latest" keeps ordering by run_id desc), run_attempt is always 1,
-- source_sha is the results commit, matrix is collectivex/results/cases.json, and
-- cx_run_docs holds the commit's result documents verbatim. Re-ingesting a commit
-- replaces its row and documents.
--
-- Lazy GitHub Actions discovery is gone, so a deleted run no longer needs a
-- tombstone to stay deleted: removing results is a commit to the benchmark repo.

alter table cx_runs drop column if exists deleted_at;

comment on table cx_runs is
  'One row per InferenceX commit that changed collectivex/results/ on main; run_id = commit time in epoch seconds.';
comment on table cx_run_docs is
  'The committed collectivex/results/<sku>/<case_id>.json documents of each cx_runs row, verbatim.';
