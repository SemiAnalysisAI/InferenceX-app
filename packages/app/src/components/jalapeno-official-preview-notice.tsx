'use client';

import { Info } from 'lucide-react';

import { hardwareKeyMatchesAnyBase } from '@/lib/constants';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    title: 'InferenceX Official Preview',
    description:
      'Jalapeño results are an official preview and may change as validation and publication continue.',
  },
  zh: {
    title: 'InferenceX 官方预览',
    description: 'Jalapeño 结果为官方预览；随着验证和发布工作的推进，数据可能会调整。',
  },
} as const;

export function includesJalapenoResult(hardwareKeys: Iterable<string>): boolean {
  for (const hardwareKey of hardwareKeys) {
    if (hardwareKeyMatchesAnyBase(hardwareKey, ['jalapeno'])) return true;
  }
  return false;
}

export function JalapenoOfficialPreviewNotice() {
  const t = STRINGS[useLocale()];

  return (
    <div
      role="note"
      aria-label={t.title}
      data-testid="jalapeno-official-preview-notice"
      className="mb-2 flex items-start gap-3 rounded-lg border border-brand/30 bg-brand/5 px-4 py-3"
    >
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{t.title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t.description}</p>
      </div>
    </div>
  );
}
