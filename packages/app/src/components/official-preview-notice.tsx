'use client';

import { Info } from 'lucide-react';

import { hardwareKeyMatchesAnyBase } from '@/lib/constants';
import { useLocale } from '@/lib/use-locale';

export const JALAPENO_PREVIEW_STRINGS = {
  en: {
    title: 'InferenceX Official Preview',
    description:
      'Jalapeño results are an official preview and may change as validation and publication continue.',
    chartDetail: 'Results may change as validation and publication continue.',
  },
  zh: {
    title: 'InferenceX 官方预览',
    description: 'Jalapeño 结果为官方预览；随着验证和发布工作的推进，数据可能会调整。',
    chartDetail: '随着验证和发布工作的推进，结果可能会调整。',
  },
} as const;

export const VERA_RUBIN_PREVIEW_STRINGS = {
  en: {
    title: 'InferenceX Official Preview',
    description:
      'Vera Rubin (July) results are an official preview and may change as validation and publication continue.',
    chartDetail: 'Results may change as validation and publication continue.',
  },
  zh: {
    title: 'InferenceX 官方预览',
    description: 'Vera Rubin (July) 结果为官方预览；随着验证和发布工作的推进，数据可能会调整。',
    chartDetail: '随着验证和发布工作的推进，结果可能会调整。',
  },
} as const;

export const OFFICIAL_PREVIEW_SERIES = [
  {
    id: 'jalapeno-official-preview',
    baseGpuKeys: ['jalapeno'],
    strings: JALAPENO_PREVIEW_STRINGS,
  },
  {
    id: 'vera-rubin-official-preview',
    baseGpuKeys: ['vr200'],
    strings: VERA_RUBIN_PREVIEW_STRINGS,
  },
] as const;

function includesHardwareResult(
  hardwareKeys: Iterable<string>,
  baseGpuKeys: readonly string[],
): boolean {
  for (const hardwareKey of hardwareKeys) {
    if (hardwareKeyMatchesAnyBase(hardwareKey, baseGpuKeys)) return true;
  }
  return false;
}

export function includesJalapenoResult(hardwareKeys: Iterable<string>): boolean {
  return includesHardwareResult(hardwareKeys, OFFICIAL_PREVIEW_SERIES[0].baseGpuKeys);
}

export function includesVeraRubinResult(hardwareKeys: Iterable<string>): boolean {
  return includesHardwareResult(hardwareKeys, OFFICIAL_PREVIEW_SERIES[1].baseGpuKeys);
}

interface OfficialPreviewNoticeProps {
  strings: typeof JALAPENO_PREVIEW_STRINGS | typeof VERA_RUBIN_PREVIEW_STRINGS;
  testId: string;
}

function OfficialPreviewNotice({ strings, testId }: OfficialPreviewNoticeProps) {
  const t = strings[useLocale()];

  return (
    <div
      role="note"
      aria-label={t.title}
      data-testid={testId}
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

export function JalapenoOfficialPreviewNotice() {
  return (
    <OfficialPreviewNotice
      strings={JALAPENO_PREVIEW_STRINGS}
      testId="jalapeno-official-preview-notice"
    />
  );
}

export function VeraRubinOfficialPreviewNotice() {
  return (
    <OfficialPreviewNotice
      strings={VERA_RUBIN_PREVIEW_STRINGS}
      testId="vera-rubin-official-preview-notice"
    />
  );
}
