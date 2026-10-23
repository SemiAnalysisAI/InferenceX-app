import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

import type { AggDataEntry, InferenceData, RunInfo } from '@/components/inference/types';
import { FRAMEWORK_LABELS } from '@semianalysisai/inferencex-constants';

import { DEFAULT_TCO_BASIS, getGpuSpecs, type TcoBasis } from '../catalog/constants';

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      tracking: ['eyebrow', 'eyebrow-wide', 'heading'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function updateRepoUrl(url: string): string {
  return url.replaceAll(
    /https?:\/\/github\.com\/InferenceMAX\/InferenceMAX\//gu,
    'https://github.com/SemiAnalysisAI/InferenceX/',
  );
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatNumber(tickItem: number) {
  if (tickItem < 10000) {
    return tickItem.toString();
  }
  return new Intl.NumberFormat('en-US').format(tickItem);
}

export function calculateCostsForGpus(
  data: InferenceData[],
  userCosts: Record<string, number | undefined>,
): InferenceData[] {
  const result = data.map((item) => {
    const baseGpuKey = item.hwKey.toString().split('_')[0];
    let userCostPerHour = userCosts[baseGpuKey];

    if (userCostPerHour === undefined && item.hwKey !== baseGpuKey) {
      userCostPerHour = userCosts[baseGpuKey];
    }
    if (userCostPerHour !== undefined) {
      const tputPerGpu = item.tpPerGpu.y;
      const millionTokensPerHour = (tputPerGpu * 3600) / 1_000_000;
      const costPerMillion = millionTokensPerHour > 0 ? userCostPerHour / millionTokensPerHour : 0;
      const tokensPerDollar = userCostPerHour > 0 ? (tputPerGpu * 3600) / userCostPerHour : 0;
      const costRounded = parseFloat(costPerMillion.toFixed(3));
      const tokensRounded = parseFloat(tokensPerDollar.toFixed(3));

      return {
        ...item,
        y: costRounded,
        costUser: {
          y: costRounded,
          roof: false,
        },
        tokensPerDollarUser: {
          y: tokensRounded,
          roof: false,
        },
      };
    }
    return item;
  });

  return result;
}

export function calculatePowerForGpus(
  data: InferenceData[],
  userPowers: Record<string, number | undefined>,
): InferenceData[] {
  const result = data.map((item) => {
    const baseGpuKey = item.hwKey.toString().split('_')[0];
    let userPowerPerHour = userPowers[baseGpuKey];

    if (userPowerPerHour === undefined && item.hwKey !== baseGpuKey) {
      userPowerPerHour = userPowers[baseGpuKey];
    }
    const basePower = getGpuSpecs(baseGpuKey).power;
    if (!(basePower > 0) || !item.tpPerMw) return item;
    if (userPowerPerHour !== undefined) {
      const powerRounded = parseFloat(((item.tpPerMw.y / basePower) * userPowerPerHour).toFixed(3));

      return {
        ...item,
        y: powerRounded,
        powerUser: {
          y: powerRounded,
          roof: false,
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
  suffixes = [...new Set(suffixes)];
  return (
    baseHw.toUpperCase() +
    (suffixes.length > 0
      ? ` (${suffixes.map((suffix) => getFrameworkLabel(suffix as string)).join(', ')})`
      : '')
  );
}

export function getDisplayLabel(config: { label: string; suffix?: string }): string {
  return config.suffix ? `${config.label} ${config.suffix}` : config.label;
}

export function computeOutputCostFields(
  data: InferenceData[],
  tcoBasis: TcoBasis = DEFAULT_TCO_BASIS,
): InferenceData[] {
  return data.map((item) => {
    if (
      item.costhOutput &&
      item.costrOutput &&
      item.outputTokensPerDollarH &&
      item.outputTokensPerDollarR
    ) {
      return item;
    }

    const specs = getGpuSpecs(item.hwKey, tcoBasis);

    const outputTputPerGpu = item.outputTputPerGpu?.y ?? item.tpPerGpu.y * 0.875;
    const outputTokensPerHour = outputTputPerGpu * 3600;
    const millionOutputTokensPerHour = outputTokensPerHour / 1_000_000;
    const costhOutput =
      millionOutputTokensPerHour > 0 ? specs.costh / millionOutputTokensPerHour : 0;
    const costrOutput =
      millionOutputTokensPerHour > 0 ? specs.costr / millionOutputTokensPerHour : 0;

    return {
      ...item,
      costhOutput: item.costhOutput ?? {
        y: parseFloat(costhOutput.toFixed(3)),
        roof: false,
      },
      costrOutput: item.costrOutput ?? {
        y: parseFloat(costrOutput.toFixed(3)),
        roof: false,
      },
      outputTokensPerDollarH: item.outputTokensPerDollarH ?? {
        y: specs.costh > 0 ? outputTokensPerHour / specs.costh : 0,
        roof: false,
      },
      outputTokensPerDollarR: item.outputTokensPerDollarR ?? {
        y: specs.costr > 0 ? outputTokensPerHour / specs.costr : 0,
        roof: false,
      },
    };
  });
}

export function filterRunsByModel(
  availableRuns: Record<string, RunInfo> | null,
  modelPrefixes: string[],
  selectedPrecisions?: string[],
  selectedGPUs?: string[],
): Record<string, RunInfo> | null {
  if (!availableRuns || modelPrefixes.length === 0) return availableRuns;

  const filterByPrecision = selectedPrecisions && selectedPrecisions.length > 0;
  const filterByGpu = selectedGPUs && selectedGPUs.length > 0;
  const gpuConfigSuffixes = filterByGpu
    ? new Set(selectedGPUs!.map((gpu) => gpu.replaceAll('_', '-')))
    : null;

  const filtered: Record<string, RunInfo> = {};
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

  if (Object.keys(filtered).length > 0) return filtered;

  const fallback: Record<string, RunInfo> = {};
  for (const [runId, runInfo] of Object.entries(availableRuns)) {
    fallback[runId] = { ...runInfo, changelog: undefined };
  }
  return Object.keys(fallback).length > 0 ? fallback : null;
}

export function computeEnergyFields(data: InferenceData[]): InferenceData[] {
  return data.map((item) => {
    if (item.jTotal) {
      return item;
    }

    const specs = getGpuSpecs(item.hwKey);
    const hardwarePower = specs.power;
    if (!(hardwarePower > 0)) return item;

    const tputPerGpu = item.tpPerGpu.y;
    const outputTputPerGpu = item.outputTputPerGpu?.y;
    const inputTputPerGpu = item.inputTputPerGpu?.y;

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

export function computeInputCostFields(
  data: InferenceData[],
  tcoBasis: TcoBasis = DEFAULT_TCO_BASIS,
): InferenceData[] {
  return data.map((item) => {
    if (item.costhi && item.costri && item.inputTokensPerDollarH && item.inputTokensPerDollarR) {
      return item;
    }

    const specs = getGpuSpecs(item.hwKey, tcoBasis);

    const inputTputPerGpu = item.inputTputPerGpu?.y ?? item.tpPerGpu.y * 0.125;
    const inputTokensPerHour = inputTputPerGpu * 3600;
    const millionInputTokensPerHour = inputTokensPerHour / 1_000_000;
    const costhi = millionInputTokensPerHour > 0 ? specs.costh / millionInputTokensPerHour : 0;
    const costri = millionInputTokensPerHour > 0 ? specs.costr / millionInputTokensPerHour : 0;

    return {
      ...item,
      costhi: item.costhi ?? {
        y: parseFloat(costhi.toFixed(3)),
        roof: false,
      },
      costri: item.costri ?? {
        y: parseFloat(costri.toFixed(3)),
        roof: false,
      },
      inputTokensPerDollarH: item.inputTokensPerDollarH ?? {
        y: specs.costh > 0 ? inputTokensPerHour / specs.costh : 0,
        roof: false,
      },
      inputTokensPerDollarR: item.inputTokensPerDollarR ?? {
        y: specs.costr > 0 ? inputTokensPerHour / specs.costr : 0,
        roof: false,
      },
    };
  });
}
