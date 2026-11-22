'use client';

import { useMemo } from 'react';

import {
  useInferenceActions,
  useInferenceData,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import type { InferenceData } from '@/components/inference/types';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useAvailability } from '@/hooks/api/use-availability';
import { track } from '@/lib/analytics/analytics';
import { getModelLabel, type Model } from '@/lib/catalog/data-mappings';
import { useLocale } from '@/lib/i18n/use-locale';

import { powerXRoleRows } from './powerx-insight';
import type { PowerXRole } from './powerx-role';
import { modelsWithRoleData } from './powerx-role-availability';

const STRINGS = {
  en: {
    message: (model: string) =>
      `No prefill/decode split for ${model} in this scenario: every result runs aggregated.`,
    existsOn: 'Prefill/decode data exists on',
    switchTo: (model: string) => `Switch to ${model}`,
  },
  zh: {
    message: (model: string) => `${model} 在此场景下没有预填充/解码拆分：所有结果均为聚合式部署。`,
    existsOn: '以下模型有预填充/解码数据：',
    switchTo: (model: string) => `切换到 ${model}`,
  },
} as const;

export interface PowerXRoleNoDataProps {
  role: PowerXRole;
  /** The chart's visible rows; the notice shows only when none has per-pool telemetry. */
  points: readonly InferenceData[];
}

/**
 * Shown when a GPU role is picked on a model whose visible rows are all aggregated. It
 * names the models with prefill/decode results for the same scenario, one click away; the
 * role itself is never reverted.
 */
export function PowerXRoleNoData({ role, points }: PowerXRoleNoDataProps) {
  const t = STRINGS[useLocale()];
  const { selectedModel, selectedSequence, selectedPrecisions } = useInferenceFilters();
  const { availableModels } = useInferenceData();
  const { setSelectedModel } = useInferenceActions();
  const { data: availability } = useAvailability();
  const hasRoleRows = useMemo(() => powerXRoleRows(points).length > 0, [points]);
  const alternatives = useMemo(
    () =>
      modelsWithRoleData(
        availability,
        { sequence: selectedSequence, precisions: selectedPrecisions },
        availableModels,
      ).filter((model) => model !== selectedModel),
    [availability, selectedSequence, selectedPrecisions, availableModels, selectedModel],
  );
  if (role === 'all' || hasRoleRows) return null;
  const pick = (model: string) => {
    track('powerx_role_nodata_model_selected', { role, from: selectedModel, model });
    setSelectedModel(model as Model);
  };
  return (
    <EmptyState
      role="status"
      data-testid="powerx-role-no-data"
      className="mb-2 items-start border-dashed border-border px-3 py-2 text-left"
      action={
        alternatives.length > 0 ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            <span>{t.existsOn}</span>
            {alternatives.map((model) => {
              const label = getModelLabel(model as Model);
              return (
                <Button
                  key={model}
                  type="button"
                  variant="outline"
                  size="xs"
                  aria-label={t.switchTo(label)}
                  data-testid="powerx-role-no-data-model"
                  data-model={model}
                  onClick={() => pick(model)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        ) : undefined
      }
    >
      <p className="text-foreground">{t.message(getModelLabel(selectedModel as Model))}</p>
    </EmptyState>
  );
}
