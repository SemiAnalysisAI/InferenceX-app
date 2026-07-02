/**
 * Hardware-key normalization for the three data sources that produce chart
 * points (benchmarks, evaluations/reliability, availability). See
 * docs/data-transforms.md § "Hardware Key Construction" for the full rationale.
 *
 * Runtime-compatible: no Node.js-specific modules (fs, path) or build-time
 * dependencies. Split out of chart-utils.ts; re-exported from there so existing
 * imports (`@/lib/chart-utils`) keep working unchanged.
 */

import { resolveFrameworkAlias } from '@semianalysisai/inferencex-constants';

import type { AggDataEntry } from '@/lib/chart-types';
import { isKnownGpu } from '@/lib/constants';

/**
 * Determines the correct hardware key based on the hardware name and MTP status.
 */
export const getHardwareKey = (entry: AggDataEntry): string => {
  let normalizedHwName = entry.hw.split('-')[0];
  if (entry.framework) {
    // Resolve legacy/aliased framework names (e.g. atom-disagg → mooncake-atom) so chart
    // point keys match the canonical keys built by buildAvailabilityHwKey for the GPU filter.
    const fw = resolveFrameworkAlias(entry.framework);
    // Try framework as-is first, then disagg variant if it exists
    const candidateDirect = `${normalizedHwName}_${fw}`;
    if (isKnownGpu(candidateDirect)) {
      normalizedHwName = candidateDirect;
    } else if (entry.disagg) {
      const candidateDisagg = `${normalizedHwName}_${fw}-disagg`;
      normalizedHwName = isKnownGpu(candidateDisagg) ? candidateDisagg : candidateDirect;
    } else {
      normalizedHwName = candidateDirect;
    }
  }
  if (entry.mtp === 'on' || entry['spec_decoding'] === 'mtp') {
    normalizedHwName = `${normalizedHwName}_mtp`;
  } else if (entry['spec_decoding'] && entry['spec_decoding'] !== 'none') {
    normalizedHwName = `${normalizedHwName}_${entry['spec_decoding']}`;
  }
  return normalizedHwName;
};

/**
 * Normalizes a hardware key from evaluation/reliability data entries.
 * Handles the looser naming conventions in eval data (e.g. "B200 NB", "H200 CW")
 * by stripping qualifiers and building a normalized hardware key.
 */
export function normalizeEvalHardwareKey(
  hw: string,
  framework?: string,
  specDecoding?: string,
): string {
  let hwName = hw.toLowerCase().replaceAll('-', '_');

  // Strip additional qualifiers not relevant to GPU identification
  // e.g., "b200 nb" -> "b200", "h200 cw" -> "h200"
  hwName = hwName.replace(/\s+(?:nb|cw|nv|dgxc|amds|cr|amd)$/iu, '');

  // Try to find a more specific hardware config that includes framework
  if (framework) {
    const frameworkKey = resolveFrameworkAlias(framework).replaceAll('-', '_');
    const specificHwName = `${hwName}_${frameworkKey}`;

    if (isKnownGpu(specificHwName)) {
      hwName = specificHwName;
    }

    // Also check for configs with spec_decoding in the key
    if (specDecoding && specDecoding !== 'none') {
      const specKey = specDecoding.toLowerCase().replaceAll('-', '_');
      const withSpecHwName = `${hwName}_${specKey}`;
      if (isKnownGpu(withSpecHwName)) {
        hwName = withSpecHwName;
      }
    }
  }

  return isKnownGpu(hwName) ? hwName : 'unknown';
}

/**
 * Builds a hardware key from availability row fields.
 * Used by InferenceContext to match availability rows to hardware configs.
 */
export function buildAvailabilityHwKey(
  hardware: string,
  framework?: string,
  specMethod?: string,
  disagg?: boolean,
): string {
  let hwKey = hardware.split('-')[0];
  const fw = framework ? resolveFrameworkAlias(framework) : undefined;
  if (fw) {
    // Try framework as-is first, then disagg variant if it exists
    const candidateDirect = `${hwKey}_${fw}`;
    if (isKnownGpu(candidateDirect)) {
      hwKey = candidateDirect;
    } else if (disagg) {
      const candidateDisagg = `${hwKey}_${fw}-disagg`;
      hwKey = isKnownGpu(candidateDisagg) ? candidateDisagg : candidateDirect;
    } else {
      hwKey = candidateDirect;
    }
  }
  if (specMethod === 'mtp') hwKey = `${hwKey}_mtp`;
  else if (specMethod && specMethod !== 'none') hwKey = `${hwKey}_${specMethod}`;
  return hwKey;
}
