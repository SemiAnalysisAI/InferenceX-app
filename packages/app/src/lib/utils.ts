import { type ClassValue, clsx } from 'clsx';
import { uniq } from 'lodash-es';
import { twMerge } from 'tailwind-merge';

import type { AggDataEntry, InferenceData, RunInfo } from '@/components/inference/types';

import { FRAMEWORK_LABELS, getGpuSpecs } from './constants';
/**
 * Combines Tailwind CSS classes and other class values into a single string.
 * This utility helps in conditionally applying classes and merging them efficiently,
 * especially when dealing with Tailwind's utility-first approach.
 *
 * @param inputs - A rest parameter of `ClassValue` types, which can be strings,
 *                 arrays of strings, or objects where keys are class names and
 *                 values are booleans.
 * @returns A single string containing merged and optimized CSS class names.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Updates GitHub repo URLs from the old InferenceMAX/InferenceMAX repo
 * to the new SemiAnalysisAI/InferenceX repo.
 * Used for runtime fixing of URLs in loaded data.
 *
 * @param url - The URL to update
 * @returns The updated URL
 */
export function updateRepoUrl(url: string): string {
  return url.replace(
    /https?:\/\/github\.com\/InferenceMAX\/InferenceMAX\//g,
    'https://github.com/SemiAnalysisAI/InferenceX/',
  );
}

/**
 * Formats a number for display - returns plain string for numbers < 10000,
 * and formatted number with commas for larger numbers.
 *
 * @param tickItem - The number to format
 * @returns Formatted number as string
 */
export function formatNumber(tickItem: number) {
  if (tickItem < 10000) {
    return tickItem.toString();
  }
  return new Intl.NumberFormat('en-US').format(tickItem);
}

/**
 * Calculate costs for each GPU using the formula
 * GPUs with prefixes (TRT, MTP) will inherit values from their base parent
 */
export function calculateCostsForGpus(
  data: InferenceData[],
  userCosts: { [gpuKey: string]: number | undefined },
): InferenceData[] {
  const result = data.map((item) => {
    const baseGpuKey = item.hwKey.toString().split('_')[0];
    let userCostPerHour = userCosts[baseGpuKey];
    // Check if the GPU has a direct user cost value

    // If not, check if it's a prefixed GPU that should inherit from its base
    if (userCostPerHour === undefined && item.hwKey !== baseGpuKey) {
      userCostPerHour = userCosts[baseGpuKey];
    }
    if (userCostPerHour !== undefined) {
      const tputPerGpu = item.tpPerGpu.y;
      const tokensPerHour = (tputPerGpu * 3600) / 1000000;
      const costPerMillion = userCostPerHour / tokensPerHour;
      const costRounded = parseFloat(costPerMillion.toFixed(3));

      // Return the data with costUser property and updated y value
      return {
        ...item,
        y: costRounded, // Update the main y value for chart rendering
        costUser: {
          y: costRounded,
          roof: false, // Always false for user-calculated values
        },
      };
    }
    return item;
  });

  return result;
}

/**
 * Calculate power for each GPU using the formula
 */
export function calculatePowerForGpus(
  data: InferenceData[],
  userPowers: { [gpuKey: string]: number | undefined },
): InferenceData[] {
  const result = data.map((item) => {
    const baseGpuKey = item.hwKey.toString().split('_')[0];
    let userPowerPerHour = userPowers[baseGpuKey];
    // Check if the GPU has a direct user cost value

    // If not, check if it's a prefixed GPU that should inherit from its base
    if (userPowerPerHour === undefined && item.hwKey !== baseGpuKey) {
      userPowerPerHour = userPowers[baseGpuKey];
    }
    const basePower = getGpuSpecs(baseGpuKey).power;
    if (userPowerPerHour !== undefined) {
      const powerRounded = parseFloat(((item.tpPerMw.y / basePower) * userPowerPerHour).toFixed(3));

      // Return the data with powerUser property and updated y value
      return {
        ...item,
        y: powerRounded, // Update the main y value for chart rendering
        powerUser: {
          y: powerRounded,
          roof: false, // Always false for user-calculated values
        },
      };
    }
    return item;
  });

  return result;
}
export function getFrameworkLabel(framework: string) {
  return (
    FRAMEWORK_LABELS[framework] ??
    framework
      .split('-')
      .map((word) => word.toUpperCase())
      .join(' ')
  );
}

export function getHardwareLabel(entry: AggDataEntry) {
  const baseHw = entry.hw.split('-')[0];
  let suffixes = [];
  if (entry.framework) {
    suffixes.push(entry.framework);
  }
  if (entry.mtp === 'on') {
    suffixes.push('mtp');
  }
  if (entry['spec_decoding'] && entry['spec_decoding'] !== 'none') {
    suffixes.push(entry['spec_decoding']);
  }
  suffixes = uniq(suffixes);
  return (
    baseHw.toUpperCase() +
    (suffixes.length > 0
      ? ` (${suffixes.map((suffix) => getFrameworkLabel(suffix as string)).join(', ')})`
      : '')
  );
}

/**
 * Combines a hardware config's label and suffix into a display string.
 * Used by frontend consumers to show full GPU names (e.g., "MI355X (ATOM)").
 */
export function getDisplayLabel(config: { label: string; suffix?: string }): string {
  return config.suffix ? `${config.label} ${config.suffix}` : config.label;
}

export const parseRunDate = (dateStr: string) => {
  const [datePart] = dateStr.split(', ');
  const [month, day, year] = datePart.split('/');
  return `${year}-${month}-${day}`;
};

/**
 * Computes missing output cost fields (costhOutput, costnOutput, costrOutput) for data points.
 * This handles backwards compatibility with historical data that doesn't have these fields.
 *
 * The calculation is: costPerHour / outputTokensPerHour
 * where outputTokensPerHour = (outputTputPerGpu * 3600) / 1000000
 *
 * If outputTputPerGpu is not available, falls back to using the total throughput ratio.
 */
export function computeOutputCostFields(data: InferenceData[]): InferenceData[] {
  return data.map((item) => {
    // If output cost fields already exist, return as-is
    if (item.costhOutput && item.costnOutput && item.costrOutput) {
      return item;
    }

    // Compute output cost fields from existing data
    const specs = getGpuSpecs(item.hwKey);

    // Get output throughput - either from outputTputPerGpu or estimate from total throughput
    // For sequence pairs like 1k/8k (ISL/OSL), output tokens dominate, typically ~87.5% of total
    const outputTputPerGpu = item.outputTputPerGpu?.y ?? item.tpPerGpu.y * 0.875;
    const outputTokensPerHour = (outputTputPerGpu * 3600) / 1000000;

    // Calculate output cost per million tokens for each cost type
    const costhOutput = outputTokensPerHour > 0 ? specs.costh / outputTokensPerHour : 0;
    const costnOutput = outputTokensPerHour > 0 ? specs.costn / outputTokensPerHour : 0;
    const costrOutput = outputTokensPerHour > 0 ? specs.costr / outputTokensPerHour : 0;

    return {
      ...item,
      costhOutput: item.costhOutput ?? {
        y: parseFloat(costhOutput.toFixed(3)),
        roof: false,
      },
      costnOutput: item.costnOutput ?? {
        y: parseFloat(costnOutput.toFixed(3)),
        roof: false,
      },
      costrOutput: item.costrOutput ?? {
        y: parseFloat(costrOutput.toFixed(3)),
        roof: false,
      },
    };
  });
}

/**
 * Computes missing input cost fields (costhi, costni, costri) at runtime.
 * This handles backwards compatibility with historical data that doesn't have these fields.
 *
 * The calculation is: costPerHour / inputTokensPerHour
 * where inputTokensPerHour = (inputTputPerGpu * 3600) / 1000000
 *
 * If inputTputPerGpu is not available, falls back to using a portion of total throughput.
 */
/**
 * Filters availableRuns to only include runs with changelog entries
 * relevant to the selected model, precision(s), and GPU config(s).
 *
 * Changelog config-keys have format: {modelPrefix}-{precision}-{gpu}-{framework}[-{mtp}]
 * where modelPrefix is one of the keys from MODEL_PREFIX_MAPPING (e.g. 'gptoss', 'dsr1'),
 * precision is a lowercase value (e.g. 'fp8', 'fp4'), and gpu+framework+mtp map to hwKeys
 * (e.g. hwKey 'mi355x_mori-sglang_mtp' → config suffix 'mi355x-mori-sglang-mtp').
 *
 * @param availableRuns - All runs for the selected date
 * @param modelPrefixes - Model prefix strings from MODEL_PREFIX_MAPPING for the selected model
 * @param selectedPrecisions - Optional list of selected precision values (e.g. ['fp8']). When
 *   provided and non-empty, only entries whose config-key precision segment matches are kept.
 * @param selectedGPUs - Optional list of hwKeys (e.g. ['mi355x_mori-sglang_mtp']). When
 *   provided and non-empty, only entries whose config-key GPU+framework suffix matches are kept.
 * @returns Filtered runs with relevant changelog entries, or null if none match
 */
export function filterRunsByModel(
  availableRuns: { [runId: string]: RunInfo } | null,
  modelPrefixes: string[],
  selectedPrecisions?: string[],
  selectedGPUs?: string[],
): { [runId: string]: RunInfo } | null {
  if (!availableRuns || modelPrefixes.length === 0) return availableRuns;

  const filterByPrecision = selectedPrecisions && selectedPrecisions.length > 0;
  const filterByGpu = selectedGPUs && selectedGPUs.length > 0;
  // Convert hwKey format (underscores as separators) to config-key format (all dashes)
  // e.g. 'mi355x_mori-sglang_mtp' → 'mi355x-mori-sglang-mtp'
  const gpuConfigSuffixes = filterByGpu
    ? new Set(selectedGPUs!.map((gpu) => gpu.replace(/_/g, '-')))
    : null;

  const filtered: { [runId: string]: RunInfo } = {};
  for (const [runId, runInfo] of Object.entries(availableRuns)) {
    if (!runInfo.changelog) continue;

    const relevantEntries = runInfo.changelog.entries.filter((entry) =>
      entry.config_keys.some((key: string) => {
        const parts = key.split('-');
        const gpuSuffix = parts.slice(2).join('-');
        return (
          modelPrefixes.includes(parts[0]) &&
          (!filterByPrecision || selectedPrecisions!.includes(parts[1])) &&
          (!gpuConfigSuffixes || gpuConfigSuffixes.has(gpuSuffix))
        );
      }),
    );

    if (relevantEntries.length > 0) {
      filtered[runId] = {
        ...runInfo,
        changelog: {
          ...runInfo.changelog,
          entries: relevantEntries,
        },
      };
    }
  }

  return Object.keys(filtered).length > 0 ? filtered : null;
}

/**
 * Computes missing energy fields (jTotal, jOutput, jInput) at runtime.
 * This handles backwards compatibility with historical data that doesn't have these fields.
 *
 * The calculation is: J/token = W/GPU / tok/s/gpu
 * where W/GPU = power_kW * 1000 (convert kW to watts)
 * Since Watt = Joule/second: W / (tok/s) = J/tok
 */
export function computeEnergyFields(data: InferenceData[]): InferenceData[] {
  return data.map((item) => {
    // If energy fields already exist, return as-is
    if (item.jTotal) {
      return item;
    }

    const specs = getGpuSpecs(item.hwKey);
    const hardwarePower = specs.power; // in kW

    const tputPerGpu = item.tpPerGpu.y;
    const outputTputPerGpu = item.outputTputPerGpu?.y;
    const inputTputPerGpu = item.inputTputPerGpu?.y;

    // J/token = W / (tok/s) = (kW * 1000) / (tok/s)
    const jTotal = hardwarePower && tputPerGpu ? (hardwarePower * 1000) / tputPerGpu : 0;

    const result: InferenceData = {
      ...item,
      jTotal: { y: jTotal, roof: false },
    };

    if (outputTputPerGpu) {
      result.jOutput = {
        y: hardwarePower && outputTputPerGpu ? (hardwarePower * 1000) / outputTputPerGpu : 0,
        roof: false,
      };
    }

    if (inputTputPerGpu) {
      result.jInput = {
        y: hardwarePower && inputTputPerGpu ? (hardwarePower * 1000) / inputTputPerGpu : 0,
        roof: false,
      };
    }

    return result;
  });
}

export function computeInputCostFields(data: InferenceData[]): InferenceData[] {
  return data.map((item) => {
    // If input cost fields already exist, return as-is
    if (item.costhi && item.costni && item.costri) {
      return item;
    }

    // Compute input cost fields from existing data
    const specs = getGpuSpecs(item.hwKey);

    // Get input throughput - either from inputTputPerGpu or estimate from total throughput
    // For sequence pairs like 1k/8k (ISL/OSL), input tokens are typically ~12.5% of total
    const inputTputPerGpu = item.inputTputPerGpu?.y ?? item.tpPerGpu.y * 0.125;
    const inputTokensPerHour = (inputTputPerGpu * 3600) / 1000000;

    // Calculate input cost per million tokens for each cost type
    const costhi = inputTokensPerHour > 0 ? specs.costh / inputTokensPerHour : 0;
    const costni = inputTokensPerHour > 0 ? specs.costn / inputTokensPerHour : 0;
    const costri = inputTokensPerHour > 0 ? specs.costr / inputTokensPerHour : 0;

    return {
      ...item,
      costhi: item.costhi ?? {
        y: parseFloat(costhi.toFixed(3)),
        roof: false,
      },
      costni: item.costni ?? {
        y: parseFloat(costni.toFixed(3)),
        roof: false,
      },
      costri: item.costri ?? {
        y: parseFloat(costri.toFixed(3)),
        roof: false,
      },
    };
  });
}
