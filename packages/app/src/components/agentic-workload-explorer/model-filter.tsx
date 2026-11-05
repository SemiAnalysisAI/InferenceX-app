'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';

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
      value={selectedModel === null ? 'all' : `model:${selectedModel}`}
      onValueChange={(v) => {
        const model = v === 'all' ? null : v.slice('model:'.length);
        onModelChange(model);
        track('agentic_workload_model_filter_changed', { model });
      }}
    >
      <SelectTrigger aria-label={t.allModels} className="max-w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t.allModels}</SelectItem>
        {models.map((model) => (
          <SelectItem key={model} value={`model:${model}`}>
            {model}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
