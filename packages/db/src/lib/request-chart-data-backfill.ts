import { createHash } from 'node:crypto';

import { REQUEST_TIMELINE_VERSION } from '../etl/compute-request-timeline.js';
import type { Sql } from '../etl/db-utils.js';
import { encodeRequestChartColumns } from '../etl/request-chart-columns.js';
import { uploadTraceReplayPayloadChunks } from '../etl/trace-replay-ingest.js';
import {
  REQUEST_CHART_DATA_VERSION,
  requestChartDataFromTimelineGz,
} from '../queries/request-chart-data.js';
import { readRequestTimelineGz } from '../queries/request-timeline.js';

export interface RequestChartColumnsRow {
  columns: Buffer;
  timelineBytes: number;
  timelineMd5: string;
}

export async function computeRequestChartColumns(
  sql: Sql,
  traceReplayId: number,
): Promise<RequestChartColumnsRow | null> {
  const [row] = await sql<{ gz_bytes: number }[]>`
    select octet_length(request_timeline_gz)::int as gz_bytes
    from agentic_trace_replay
    where id = ${traceReplayId}
      and request_timeline_gz is not null
      and request_timeline_version = ${REQUEST_TIMELINE_VERSION}
  `;
  if (!row) return null;
  const gz = await readRequestTimelineGz(sql, traceReplayId, row.gz_bytes);
  return {
    columns: encodeRequestChartColumns(await requestChartDataFromTimelineGz(gz)),
    timelineBytes: row.gz_bytes,
    timelineMd5: createHash('md5').update(gz).digest('hex'),
  };
}

export function writeRequestChartColumns(
  sql: Sql,
  traceReplayId: number,
  stored: RequestChartColumnsRow,
): Promise<boolean> {
  return sql.begin(async (tx) => {
    await tx`
      create temporary table trace_replay_upload_parts (
        field text not null,
        part integer not null,
        data bytea not null,
        primary key (field, part)
      ) on commit drop
    `;
    await uploadTraceReplayPayloadChunks(tx, 'request_chart_data_gz', stored.columns);
    const updated = await tx<{ id: number }[]>`
      update agentic_trace_replay
      set
        request_chart_data_gz = (
          select string_agg(data, ''::bytea order by part)
          from pg_temp.trace_replay_upload_parts
          where field = 'request_chart_data_gz'
        ),
        request_chart_data_version = ${REQUEST_CHART_DATA_VERSION}
      where id = ${traceReplayId}
        and request_timeline_version = ${REQUEST_TIMELINE_VERSION}
        and octet_length(request_timeline_gz) = ${stored.timelineBytes}
        and md5(request_timeline_gz) = ${stored.timelineMd5}
      returning id
    `;
    return updated.length > 0;
  });
}
