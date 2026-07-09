import {
  FRAMEWORK_LABELS,
  resolveFrameworkAliasesInString,
  resolveFrameworkPartLabel,
} from '@semianalysisai/inferencex-constants';

import { type Precision, MODEL_PREFIX_MAPPING, getPrecisionLabel } from '@/lib/data-mappings';
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
  const normalizedHwKey = hwKey.replaceAll('_', '-');
  return gpuAndFramework === normalizedHwKey;
}

export function formatConfigKeys(key: string) {
  const parts = key.split('-');
  const model = parts[0];
  const precision = parts[1];
  const gpu = parts[2];
  // Canonicalize legacy framework substrings first (sglang-disagg → mori-sglang, …)
  // so the tail matches the same FRAMEWORK_LABELS mapping the legend uses.
  const tokens = resolveFrameworkAliasesInString(parts.slice(3).join('-')).split('-');
  // Config-key tails can carry extra descriptors after the framework
  // (e.g. `sglang-agentic-hicache`), and frameworks themselves can be
  // multi-token (`dynamo-sglang`, `llmd-vllm`). Greedy longest-prefix match
  // against the known framework labels splits the two apart.
  // No prefix match → treat the whole tail as the framework (legacy fallback).
  let fwTokens = tokens.length;
  for (let n = tokens.length; n >= 1; n--) {
    if (FRAMEWORK_LABELS[tokens.slice(0, n).join('-')]) {
      fwTokens = n;
      break;
    }
  }
  const baseLabel = getFrameworkLabel(tokens.slice(0, fwTokens).join('-'));
  // Trailing descriptors keep their spec-method labels (M3's `mtp` renders as
  // "EAGLE"); anything unknown is title-cased instead of shouted in caps.
  const suffixLabels = tokens.slice(fwTokens).map((t) => {
    if (t === 'mtp') return resolveFrameworkPartLabel(MODEL_PREFIX_MAPPING[model], 'mtp');
    return FRAMEWORK_LABELS[t] ?? t.charAt(0).toUpperCase() + t.slice(1);
  });
  const frameworkLabel = [baseLabel, ...suffixLabels].join(', ');
  return `${gpu.toUpperCase()} (${frameworkLabel}) ${MODEL_PREFIX_MAPPING[model]} ${getPrecisionLabel(precision as Precision)}`;
}
