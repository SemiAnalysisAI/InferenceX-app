'use client';

import { Select } from '@/components/agentic-workload-explorer/ui/select';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';

const STRINGS = {
  en: {
    allModels: 'All models',
  },
  zh: {
    allModels: '所有模型',
  },
} as const;

interface ModelFilterProps {
  models: string[];
  selectedModel: string | null;
  onModelChange: (model: string | null) => void;
}

export function ModelFilter({ models, selectedModel, onModelChange }: ModelFilterProps) {
  const t = STRINGS[useLocale()];
  if (models.length === 0) return null;

  return (
    <Select
      value={selectedModel ?? ''}
      onChange={(v = '') => {
        onModelChange(v || null);
        track('agentic_workload_model_filter_changed', { model: v || null });
      }}
      options={[{ value: '', label: t.allModels }, ...models.map((m) => ({ value: m, label: m }))]}
    />
  );
}
