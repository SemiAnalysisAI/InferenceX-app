-- ============================================================
-- CONFIGS — allow prefill/decode tp / ep / num_gpu = 0
-- ============================================================
--
-- Aggregated multinode disagg runs can produce a config with no decode
-- workers for low-conc sweeps (e.g. conc=1 on dsv4 run 25296668638 had
-- decode_tp=0, decode_ep=0, num_decode_gpu=0 with all 8 GPUs on prefill).
-- The original `>= 1` checks rejected these rows during ingestion, so the
-- conc=1 point silently disappeared from the official chart. Drop the
-- prefill-side mirrors too for symmetry.

alter table configs drop constraint configs_decode_tp_positive;
alter table configs drop constraint configs_decode_ep_positive;
alter table configs drop constraint configs_num_decode_gpu_positive;
alter table configs drop constraint configs_prefill_tp_positive;
alter table configs drop constraint configs_prefill_ep_positive;
alter table configs drop constraint configs_num_prefill_gpu_positive;
