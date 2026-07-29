-- Index cx_run_docs the way readers actually query it.
--
-- 002 added run_attempt, and every doc read filters on the pair and orders by id
-- (`where run_id = ... and run_attempt = ... order by id`), but the table was
-- still indexed on run_id alone. A run holds one document per shard — 120 for a
-- full 9-SKU sweep — so the old index left the attempt filter and the ordering to
-- be resolved per row.
--
-- Ordering the index by (run_id, run_attempt, id) lets the same index satisfy the
-- filter and the sort. Kept as a separate migration rather than an edit to 002:
-- the runner skips already-applied files, so amending 002 would silently do
-- nothing wherever it has already run.

create index if not exists cx_run_docs_run_attempt_id_idx on cx_run_docs (run_id, run_attempt, id);
