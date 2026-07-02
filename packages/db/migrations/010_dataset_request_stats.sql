-- Backfill dataset-level requests/conversation statistics.
-- A request is one actual model call: each top-level turn plus each child turn
-- inside a subagent group. The group container itself is not a request.

with per_conversation as (
  select
    dc.dataset_id,
    dc.num_subagent_groups,
    (
      dc.num_turns + coalesce((
        select sum(jsonb_array_length(node.value->'children'))
        from jsonb_array_elements(coalesce(dc.structure->'nodes', '[]'::jsonb)) as node(value)
        where node.value->>'kind' = 'subagent'
      ), 0)
    )::double precision as request_count
  from dataset_conversations dc
), request_stats as (
  select
    dataset_id,
    avg(request_count) as mean_requests,
    percentile_cont(0.5) within group (order by request_count) as median_requests,
    avg(num_subagent_groups::double precision) as mean_subagents,
    percentile_cont(0.5) within group (order by num_subagent_groups) as median_subagents
  from per_conversation
  group by dataset_id
)
update datasets d
set summary = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          d.summary,
          '{meanRequestsPerConversation}',
          to_jsonb(request_stats.mean_requests),
          true
        ),
        '{medianRequestsPerConversation}',
        to_jsonb(request_stats.median_requests),
        true
      ),
      '{meanSubagentsPerTrace}',
      to_jsonb(request_stats.mean_subagents),
      true
    ),
    '{medianSubagentsPerTrace}',
    to_jsonb(request_stats.median_subagents),
    true
  ),
  '{version}',
  '3'::jsonb,
  true
)
from request_stats
where d.id = request_stats.dataset_id;
