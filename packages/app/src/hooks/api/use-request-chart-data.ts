import { useByIdQuery } from './benchmark-id-query';

type RequestChartTuple = [
  cid: number,
  phase: number,
  start: number,
  end: number,
  ttftMs: number | null,
  tpotMs: number | null,
  isl: number | null,
  osl: number | null,
  cancelled: 0 | 1,
];

interface RequestChartDataWire {
  version: number;
  timelineVersion: number;
  startNs: number;
  endNs: number;
  durationS: number;
  cids: string[];
  phases: string[];
  requests: RequestChartTuple[];
}

export interface RequestChartRecord {
  cid: string;
  phase: string;
  start: number;
  end: number;
  ttftMs: number | null;
  tpotMs: number | null;
  isl: number | null;
  osl: number | null;
  cancelled: boolean;
}

export interface RequestChartData {
  version: number;
  timelineVersion: number;
  startNs: number;
  endNs: number;
  durationS: number;
  requests: RequestChartRecord[];
}

function decodeRequestChartData(wire: RequestChartDataWire): RequestChartData {
  return {
    version: wire.version,
    timelineVersion: wire.timelineVersion,
    startNs: wire.startNs,
    endNs: wire.endNs,
    durationS: wire.durationS,
    requests: wire.requests.map((request) => ({
      cid: wire.cids[request[0]] ?? '',
      phase: wire.phases[request[1]] ?? '',
      start: request[2],
      end: request[3],
      ttftMs: request[4],
      tpotMs: request[5],
      isl: request[6],
      osl: request[7],
      cancelled: request[8] === 1,
    })),
  };
}

/** Fetches the compact request dataset used by the default point charts. */
export function useRequestChartData(id: number | null, enabled = false) {
  return useByIdQuery<RequestChartDataWire, RequestChartData>(
    'request-chart-data',
    id,
    enabled && Boolean(id),
    decodeRequestChartData,
  );
}
