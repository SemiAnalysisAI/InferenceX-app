'use client';

import { Info } from 'lucide-react';

import { hardwareKeyMatchesAnyBase } from '@/lib/catalog/constants';
import { useLocale } from '@/lib/i18n/use-locale';

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
      'Vera Rubin NVL72 results are an official preview and may change as validation and publication continue.',
    chartDetail: 'Results may change as validation and publication continue.',
  },
  zh: {
    title: 'InferenceX 官方预览',
    description: 'Vera Rubin NVL72 结果为官方预览；随着验证和发布工作的推进，数据可能会调整。',
    chartDetail: '随着验证和发布工作的推进，结果可能会调整。',
  },
} as const;

export const TPUV7_PREVIEW_STRINGS = {
  en: {
    title: 'InferenceX Official Preview',
    description:
      'TPU7x results are an official preview and may change as validation and publication continue.',
    chartDetail: 'Results may change as validation and publication continue.',
  },
  zh: {
    title: 'InferenceX 官方预览',
    description: 'TPU7x 结果为官方预览；随着验证和发布工作的推进，数据可能会调整。',
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
  {
    id: 'tpuv7-official-preview',
    baseGpuKeys: ['tpuv7'],
    strings: TPUV7_PREVIEW_STRINGS,
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

export function includesTpuv7Result(hardwareKeys: Iterable<string>): boolean {
  return includesHardwareResult(hardwareKeys, OFFICIAL_PREVIEW_SERIES[2].baseGpuKeys);
}

interface OfficialPreviewNoticeProps {
  strings:
    | typeof JALAPENO_PREVIEW_STRINGS
    | typeof VERA_RUBIN_PREVIEW_STRINGS
    | typeof TPUV7_PREVIEW_STRINGS;
  testId: string;
  variant?: OfficialPreviewNoticeVariant;
}

type OfficialPreviewNoticeVariant = 'callout' | 'inline';

function OfficialPreviewNotice({
  strings,
  testId,
  variant = 'callout',
}: OfficialPreviewNoticeProps) {
  const t = strings[useLocale()];

  if (variant === 'inline') {
    return (
      <p
        role="note"
        aria-label={t.title}
        data-testid={testId}
        className="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground"
      >
        <Info aria-hidden="true" className="mt-1 size-3.5 shrink-0 text-brand" />
        <span className="min-w-0">
          <span className="font-medium text-foreground">{t.title}</span> · {t.description}
        </span>
      </p>
    );
  }

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

export function JalapenoOfficialPreviewNotice({
  variant,
}: { variant?: OfficialPreviewNoticeVariant } = {}) {
  return (
    <OfficialPreviewNotice
      strings={JALAPENO_PREVIEW_STRINGS}
      testId="jalapeno-official-preview-notice"
      variant={variant}
    />
  );
}

export function VeraRubinOfficialPreviewNotice({
  variant,
}: { variant?: OfficialPreviewNoticeVariant } = {}) {
  return (
    <OfficialPreviewNotice
      strings={VERA_RUBIN_PREVIEW_STRINGS}
      testId="vera-rubin-official-preview-notice"
      variant={variant}
    />
  );
}

export function Tpuv7OfficialPreviewNotice({
  variant,
}: { variant?: OfficialPreviewNoticeVariant } = {}) {
  return (
    <OfficialPreviewNotice
      strings={TPUV7_PREVIEW_STRINGS}
      testId="tpuv7-official-preview-notice"
      variant={variant}
    />
  );
}
