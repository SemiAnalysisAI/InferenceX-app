-- Stamp each raw document with the run attempt that produced it.
--
-- Readers join docs on the cx_runs row's CURRENT attempt, which makes both
-- refresh races harmless: a concurrent pair of attempt-refreshes can leave
-- superseded docs behind (single-snapshot CTE deletes can miss rows written
-- after the statement's snapshot), and a reader can straddle a refresh across
-- its row/doc reads — in both cases the attempt filter hides stale documents.
-- Leftover superseded docs are garbage-collected by the next refresh's DELETE.

alter table cx_run_docs add column run_attempt int;

update cx_run_docs d
set run_attempt = r.run_attempt
from cx_runs r
where r.run_id = d.run_id and d.run_attempt is null;

alter table cx_run_docs alter column run_attempt set not null;
