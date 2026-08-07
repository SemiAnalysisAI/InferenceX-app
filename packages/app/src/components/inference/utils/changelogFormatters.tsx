import {
  FRAMEWORK_ALIASES,
  FW_REGISTRY,
  resolveFrameworkAlias,
  resolveFrameworkPartLabel,
} from '@semianalysisai/inferencex-constants';

import { type Precision, MODEL_PREFIX_MAPPING, getPrecisionLabel } from '@/lib/data-mappings';
import { getHardwareConfig } from '@/lib/constants';
import { buildAvailabilityHwKey } from '@/lib/chart-utils';
import type { RunConfigRow } from '@/lib/api';
import { getDisplayLabel } from '@/lib/utils';

const CHANGELOG_FRAMEWORK_KEYS = [
  ...Object.keys(FW_REGISTRY),
  ...Object.keys(FRAMEWORK_ALIASES),
].toSorted((a, b) => b.length - a.length);

interface ChangelogConfigScope {
  model: string;
  precision: string;
  hardware: string;
  framework: string;
}

function changelogConfigScope(configKey: string): ChangelogConfigScope | null {
  const parts = configKey.toLowerCase().split('-');
  const model = parts[0];
  const precision = parts[1];
  const hardware = parts[2];
  const remainder = parts.slice(3).join('-');
  if (!model || !precision || !hardware || !remainder) return null;

  const framework = CHANGELOG_FRAMEWORK_KEYS.find(
    (candidate) => remainder === candidate || remainder.startsWith(`${candidate}-`),
  );
  if (!framework) return null;

  return {
    model,
    precision,
    hardware,
    framework: resolveFrameworkAlias(framework),
  };
}

function matchingRunConfigs(configKey: string, runConfigs: RunConfigRow[]): RunConfigRow[] {
  const scope = changelogConfigScope(configKey);
  if (!scope) return [];

  return runConfigs.filter(
    (config) =>
      config.model === scope.model &&
      config.precision === scope.precision &&
      config.hardware === scope.hardware &&
      resolveFrameworkAlias(config.framework) === scope.framework,
  );
}

/**
 * Resolve a changelog key to chart hardware keys using configs actually emitted
 * by the workflow run. The text key scopes the changed model/config family; the
 * benchmark rows remain authoritative for spec decoding and disaggregation.
 */
export function resolveChangelogHwKeys(
  configKey: string,
  runConfigs: RunConfigRow[] = [],
): string[] {
  const resolved = matchingRunConfigs(configKey, runConfigs).map((config) =>
    buildAvailabilityHwKey(config.hardware, config.framework, config.spec_method, config.disagg),
  );
  if (resolved.length > 0) return [...new Set(resolved)];

  const fallback = changelogConfigToHwKey(configKey);
  return fallback ? [fallback] : [];
}

/**
 * Convert a changelog config key into the canonical hardware key used by chart
 * points and the legend. Agentic config keys append scenario details such as
 * `agentic`, `hicache`, and `pcp` after the serving framework; those are not
 * framework labels and must not become part of the legend identity.
 */
export function changelogConfigToHwKey(configKey: string): string | null {
  const scope = changelogConfigScope(configKey);
  if (!scope) return null;

  const remainder = configKey.toLowerCase().split('-').slice(3).join('-');
  const framework = CHANGELOG_FRAMEWORK_KEYS.find(
    (candidate) => remainder === candidate || remainder.startsWith(`${candidate}-`),
  )!;
  const trailingParts = remainder.slice(framework.length).split('-').filter(Boolean);
  const specSuffix = trailingParts.includes('mtp') ? '_mtp' : '';
  return `${scope.hardware}_${scope.framework}${specSuffix}`;
}

export function formatChangelogDescription(desc: string | string[]) {
  if (typeof desc === 'string') {
    return (
      <ul className="list-disc pl-4">
        {desc
          .split('- ')
          .filter((item) => item.trim() !== '')
          .map((item, index) => (
            <li key={index}>{item}</li>
          ))}
      </ul>
    );
  }
  return (
    <ul className="list-disc pl-4">
      {desc.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * Check whether a changelog scope includes a chart hardware key, preferring
 * benchmark-derived run configs when they are available.
 */
export function configKeyMatchesHwKey(
  configKey: string,
  hwKey: string,
  runConfigs: RunConfigRow[] = [],
): boolean {
  return resolveChangelogHwKeys(configKey, runConfigs).includes(hwKey);
}

export function formatConfigKeys(key: string, runConfigs: RunConfigRow[] = []) {
  const parts = key.split('-');
  const model = parts[0];
  const precision = parts[1];
  const modelLabel = MODEL_PREFIX_MAPPING[model];
  const hwKey = resolveChangelogHwKeys(key, runConfigs)[0];

  if (!hwKey) {
    const gpu = parts[2]?.toUpperCase() ?? '';
    const framework = parts.slice(3).join('-');
    const frameworkLabel = resolveFrameworkPartLabel(modelLabel, framework);
    return `${gpu} (${frameworkLabel}) ${modelLabel} ${getPrecisionLabel(precision as Precision)}`;
  }

  // Use the same hardware entry builder and display combiner as the legend so
  // aliases, compound framework names, and model-specific spec labels cannot
  // drift between the two surfaces.
  const hardwareLabel = getDisplayLabel(getHardwareConfig(hwKey, modelLabel));
  return `${hardwareLabel} ${modelLabel} ${getPrecisionLabel(precision as Precision)}`;
}
