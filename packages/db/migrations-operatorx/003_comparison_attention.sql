-- Attention modules get their own per-run comparison projection.
alter table opx_run_comparisons drop constraint opx_run_comparisons_op_check;
alter table opx_run_comparisons
  add constraint opx_run_comparisons_op_check check (op in ('gemm', 'moe', 'attention'));
