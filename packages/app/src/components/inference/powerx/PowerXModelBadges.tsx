'use client';

import { type ReactNode, useMemo } from 'react';

import { useInferenceFilters } from '@/components/inference/InferenceContext';
import { Badge } from '@/components/ui/badge';
import { useAvailability } from '@/hooks/api/use-availability';
import { useLocale } from '@/lib/i18n/use-locale';

import { modelsWithRoleData } from './powerx-role-availability';

const STRINGS = {
  en: { title: 'Has prefill/decode (disaggregated) results for this scenario' },
  zh: { title: '此场景下有预填充/解码分离部署的结果' },
} as const;

/**
 * The PowerX Model menu's P/D badges: one per model with disaggregated results for the
 * selected sequence and precisions. Off PowerX (`enabled` false) the map is empty.
 */
export function usePowerXModelBadges(
  enabled: boolean,
  models: readonly string[],
): ReadonlyMap<string, ReactNode> | undefined {
  const t = STRINGS[useLocale()];
  const { selectedSequence, selectedPrecisions } = useInferenceFilters();
  const { data: availability } = useAvailability();
  return useMemo(() => {
    if (!enabled) return undefined;
    const withRoles = modelsWithRoleData(
      availability,
      { sequence: selectedSequence, precisions: selectedPrecisions },
      models,
    );
    return new Map<string, ReactNode>(
      withRoles.map((model) => [
        model,
        <Badge
          key="pd"
          variant="outline"
          title={t.title}
          data-testid="powerx-model-pd-badge"
          className="h-4 border-border px-1 py-0 text-3xs font-semibold leading-none"
        >
          P/D
        </Badge>,
      ]),
    );
  }, [enabled, availability, selectedSequence, selectedPrecisions, models, t]);
}
