import { SITE_URL } from '@semianalysisai/inferencex-constants';

export const OFFICIAL_HOSTNAME = new URL(SITE_URL).hostname;

type ChartWatermark = 'logo' | 'unofficial' | 'none';

export function isUnofficialHostname(hostname: string): boolean {
  return hostname !== OFFICIAL_HOSTNAME;
}

export function getDomainAwareChartWatermark(
  watermark: ChartWatermark | 'logo-always',
  hostname: string,
): ChartWatermark {
  if (watermark === 'logo-always') return 'logo';
  return watermark === 'logo' && isUnofficialHostname(hostname) ? 'none' : watermark;
}
