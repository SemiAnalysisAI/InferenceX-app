-- Widen eval_results unique constraint to include isl, osl, conc.

alter table eval_results
  drop constraint eval_results_unique;

alter table eval_results
  add constraint eval_results_unique
    unique (workflow_run_id, config_id, task, isl, osl, conc);
