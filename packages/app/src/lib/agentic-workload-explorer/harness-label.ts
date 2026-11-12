import {
  type Harness,
  HARNESS_LABELS,
} from '@semianalysisai/inferencex-db/proxytrace/shared/harness';

import type { Locale } from '@/lib/i18n/i18n';

/** Harness display name; product names stay as-is, only the catch-all bucket is translated. */
export function harnessLabel(harness: Harness, locale: Locale): string {
  return locale === 'zh' && harness === 'other' ? '其他' : HARNESS_LABELS[harness];
}
