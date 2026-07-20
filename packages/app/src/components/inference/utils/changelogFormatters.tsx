import {
  FRAMEWORK_ALIASES,
  FW_REGISTRY,
  resolveFrameworkAlias,
  resolveFrameworkPartLabel,
} from '@semianalysisai/inferencex-constants';

import { type Precision, MODEL_PREFIX_MAPPING, getPrecisionLabel } from '@/lib/data-mappings';
import { getHardwareConfig } from '@/lib/constants';
import { getDisplayLabel } from '@/lib/utils';

const CHANGELOG_FRAMEWORK_KEYS = [
  ...Object.keys(FW_REGISTRY),
  ...Object.keys(FRAMEWORK_ALIASES),
].toSorted((a, b) => b.length - a.length);

/**
 * Convert a changelog config key into the canonical hardware key used by chart
 * points and the legend. Agentic config keys append scenario details such as
 * `agentic`, `hicache`, and `pcp` after the serving framework; those are not
 * framework labels and must not become part of the legend identity.
 */
export function changelogConfigToHwKey(configKey: string): string | null {
  const parts = configKey.toLowerCase().split('-');
  const gpu = parts[2];
  const remainder = parts.slice(3).join('-');
  if (!gpu || !remainder) return null;

  const framework = CHANGELOG_FRAMEWORK_KEYS.find(
    (candidate) => remainder === candidate || remainder.startsWith(`${candidate}-`),
  );
  if (!framework) return null;

  const trailingParts = remainder.slice(framework.length).split('-').filter(Boolean);
  const specSuffix = trailingParts.includes('mtp') ? '_mtp' : '';
  return `${gpu}_${resolveFrameworkAlias(framework)}${specSuffix}`;
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
 * Check if a changelog config key matches a hwKey.
 * Normalizes both to hyphen-separated form for comparison.
 */
export function configKeyMatchesHwKey(configKey: string, hwKey: string): boolean {
  return changelogConfigToHwKey(configKey) === hwKey;
}

export function formatConfigKeys(key: string) {
  const parts = key.split('-');
  const model = parts[0];
  const precision = parts[1];
  const modelLabel = MODEL_PREFIX_MAPPING[model];
  const hwKey = changelogConfigToHwKey(key);

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
