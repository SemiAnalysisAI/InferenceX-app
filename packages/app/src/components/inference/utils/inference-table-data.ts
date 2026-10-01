import type { AggDataEntry, InferenceData, YAxisMetricKey } from '@/components/inference/types';
import { remapInferencePoint } from '@/lib/chart-utils';
import type { Locale } from '@/lib/i18n';
import type { SystemPowerUnsupportedReason } from '@/lib/modeled-system-power';

/** Table candidates keep GPU measurements even when the all-in model cannot run. */
export function allInMeasuredTableData(
  data: readonly InferenceData[],
  metricKey: YAxisMetricKey,
  xAxisField: keyof AggDataEntry,
): InferenceData[] {
  return data
    .filter((point) => Number.isFinite(point.measuredAvgPower?.y) && point.measuredAvgPower!.y > 0)
    .map((point) => ({
      ...remapInferencePoint(point, metricKey, xAxisField),
      // InferenceData requires a number. This sentinel is table-only; exports use null/blank.
      y: point[metricKey]?.y ?? NaN,
    }));
}

export function inferenceTableYValue(point: InferenceData, yPath?: string): number | null {
  const key = yPath?.split('.')[0] as YAxisMetricKey | undefined;
  const value = point.powerVariant || !key ? point.y : point[key]?.y;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

type UnavailableReason = SystemPowerUnsupportedReason | 'energy' | 'model-unavailable';

export function allInMeasuredUnavailableReason(
  point: InferenceData,
  metricKey: string,
): UnavailableReason | null {
  if (Number.isFinite(point[metricKey as YAxisMetricKey]?.y)) return null;
  if (point.modeledSystemPower?.status === 'unsupported') return point.modeledSystemPower.reason;
  if (
    point.modeledSystemPower?.status === 'supported' &&
    metricKey === 'utilityModeledJPerOutputToken'
  )
    return 'energy';
  return 'model-unavailable';
}

const REASONS: Record<UnavailableReason, Record<Locale, string>> = {
  workload: { en: 'Unsupported workload', zh: '不支持此工作负载' },
  hardware: { en: 'Unsupported hardware', zh: '不支持此硬件' },
  telemetry: { en: 'GPU telemetry missing or invalid', zh: 'GPU 遥测缺失或无效' },
  'cpu-telemetry': {
    en: 'Grace or module telemetry missing or invalid',
    zh: 'Grace 或 module 遥测缺失或无效',
  },
  'gpu-count': { en: 'GPU count missing or inconsistent', zh: 'GPU 数量缺失或不一致' },
  topology: { en: 'Unsupported topology', zh: '不支持此拓扑' },
  'role-power': { en: 'Role power incomplete', zh: 'Prefill 或 decode 功耗不完整' },
  'model-domain': { en: 'Outside model range', zh: '超出模型适用范围' },
  energy: { en: 'Measured energy unavailable', zh: '缺少实测能耗' },
  'model-unavailable': { en: 'All-in estimate unavailable', zh: '整体功耗估算不可用' },
};

export function allInMeasuredStatusLabel(
  point: InferenceData,
  metricKey: string,
  locale: Locale,
): string {
  const reason = allInMeasuredUnavailableReason(point, metricKey);
  return reason === null ? (locale === 'zh' ? '可用' : 'Available') : REASONS[reason][locale];
}
