import { resolveFrameworkAliasesInString } from '@semianalysisai/inferencex-constants';

import { MODEL_PREFIX_MAPPING, Precision, getPrecisionLabel } from '@/lib/data-mappings';
import { getFrameworkLabel } from '@/lib/utils';

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
  const gpuAndFramework = resolveFrameworkAliasesInString(configKey.split('-').slice(2).join('-'));
  const normalizedHwKey = hwKey.replace(/_/g, '-');
  return gpuAndFramework === normalizedHwKey;
}

export function formatConfigKeys(key: string) {
  const parts = key.split('-');
  const model = parts[0];
  const precision = parts[1];
  const gpu = parts[2];
  const framework = parts.slice(3).join('-');
  // Strip -mtp suffix before lookup; MTP is shown separately
  const isMtp = framework.endsWith('-mtp');
  const baseFramework = isMtp ? framework.slice(0, -4) : framework;
  const baseLabel = getFrameworkLabel(baseFramework);
  const frameworkLabel = isMtp ? `${baseLabel}, MTP` : baseLabel;
  return `${gpu.toUpperCase()} (${frameworkLabel}) ${MODEL_PREFIX_MAPPING[model]} ${getPrecisionLabel(precision as Precision)}`;
}
