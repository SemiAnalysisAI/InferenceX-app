import { useByIdQuery } from './benchmark-id-query';
import {
  decodeRequestChartData,
  type RequestChartData,
  type RequestChartDataWire,
} from '@/lib/request-chart-data';

export type { RequestChartData, RequestChartRecord } from '@/lib/request-chart-data';

/** Fetches the compact request dataset used by the default point charts. */
export function useRequestChartData(id: number | null, enabled = false) {
  return useByIdQuery<RequestChartDataWire, RequestChartData>(
    'request-chart-data',
    id,
    enabled && Boolean(id),
    decodeRequestChartData,
  );
}
