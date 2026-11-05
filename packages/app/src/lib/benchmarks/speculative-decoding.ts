import { resolveFrameworkPartLabel } from '@semianalysisai/inferencex-constants';

import type { Locale } from '@/lib/i18n/i18n';

const SPEC_ALGORITHM_LABELS: Record<string, string> = {
  mtp: 'MTP',
  dspark: 'DSpark',
  dflash: 'DFlash',
  eagle: 'EAGLE',
  eagle3: 'EAGLE3',
  nextn: 'NextN',
};

const NATIVE_DRAFT = { en: 'native', zh: '原生' } as const;

export interface SpeculativeDecoding {
  method: string | null | undefined;
  algorithm?: string | null;
  draftModel?: string | null;
}

export const specAlgorithmLabel = (algorithm: string): string =>
  SPEC_ALGORITHM_LABELS[algorithm] ?? algorithm.toUpperCase();

export function speculativeDecodingName(
  { method, algorithm }: SpeculativeDecoding,
  model: string | undefined,
): string | null {
  if (!method || method === 'none') return null;
  return algorithm ? specAlgorithmLabel(algorithm) : resolveFrameworkPartLabel(model, method);
}

export function speculativeDecodingLabel(
  spec: SpeculativeDecoding,
  model: string | undefined,
  locale: Locale,
): string | null {
  const name = speculativeDecodingName(spec, model);
  if (!name || !spec.algorithm) return name;
  const draft =
    !spec.draftModel || spec.draftModel === 'native' ? NATIVE_DRAFT[locale] : spec.draftModel;
  return `${name} (${draft})`;
}
