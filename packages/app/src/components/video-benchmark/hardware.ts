import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

/** `h` = Owning at Large Hyperscaler Volume, `r` = Rent - 3 Year Commit (HW_REGISTRY costh/costr). */
export type CostTier = 'h' | 'r';

/** Registry keys that can appear as a whole token in an artifact GPU name, longest first. */
const TOKENS = Object.keys(HW_REGISTRY)
  .filter((key) => /^(?:h|b|gb|mi)\d/u.test(key))
  .toSorted((a, b) => b.length - a.length);

/** Map a raw device name (`NVIDIA H100 80GB HBM3`, `MI355X`) to a HW_REGISTRY key. */
export function hardwareKey(name: string): string | null {
  const lower = name.toLowerCase();
  for (const key of TOKENS) {
    if (new RegExp(`(?:^|[^a-z0-9])${key}(?![a-z0-9])`, 'u').test(lower)) return key;
  }
  return null;
}

export const hardwareLabel = (key: string): string => HW_REGISTRY[key]?.label ?? key;

export const hardwareSort = (key: string): number =>
  HW_REGISTRY[key]?.sort ?? Number.MAX_SAFE_INTEGER;

export function costPerGpuHour(key: string, tier: CostTier): number | null {
  const entry = HW_REGISTRY[key];
  if (!entry) return null;
  const value = tier === 'h' ? entry.costh : entry.costr;
  return Number.isFinite(value) && value > 0 ? value : null;
}

export interface VideoHardwareRosterEntry {
  key: string;
  /** Present when the campaign targeted this hardware but no valid observation exists. */
  unavailable?: { en: string; zh: string; runUrl: string };
}

/**
 * Hardware the frozen H3 campaign targets. Hardware without a published
 * observation still renders as an unavailable legend/table row so a missing
 * result is never mistaken for an omission. Sorted by HW_REGISTRY order.
 */
export const VIDEO_HARDWARE_ROSTER: readonly VideoHardwareRosterEntry[] = (
  [
    { key: 'h100' },
    { key: 'h200' },
    { key: 'b200' },
    {
      key: 'mi355x',
      unavailable: {
        en: 'No valid published run yet: the 2026-09-09 attempt failed before generation (AMD SMI parser).',
        zh: '尚无有效的已发布运行：2026-09-09 的尝试在生成前失败（AMD SMI 解析器）。',
        runUrl: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34411615416',
      },
    },
  ] satisfies VideoHardwareRosterEntry[]
).toSorted((a, b) => hardwareSort(a.key) - hardwareSort(b.key));
