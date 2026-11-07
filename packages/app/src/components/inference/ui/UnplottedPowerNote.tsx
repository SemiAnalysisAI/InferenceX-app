import { track } from '@/lib/analytics/analytics';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import type { Locale } from '@/lib/i18n/i18n';
import { useLocale } from '@/lib/i18n/use-locale';
import { powerBasisLabel, type PowerBasisLabelStyle } from '@/lib/power/power-basis';

import { allInMeasuredReasonLabel } from '../utils/inference-table-data';
import type { UnplottedModeledPower } from '../utils/power-chip-coverage';

const latinGap = (text: string) => (/^[A-Za-z]/u.test(text) ? ' ' : '');

const STRINGS = {
  en: {
    heading: {
      points: (points: number, boundary: string) =>
        `Not drawn: ${points} ${points === 1 ? 'point has' : 'points have'} measured GPU power but no ${boundary} estimate.`,
      lines: (points: number, boundary: string) =>
        `No ${boundary} line for ${points} ${points === 1 ? 'point' : 'points'}: drawn on the measured GPU line only.`,
    },
    or: ' or ',
    colon: ': ',
    separator: ', ',
    count: (points: number) => ` (${points})`,
    unofficial: 'unofficial',
    showTable: 'Show in table',
  },
  zh: {
    heading: {
      points: (points: number, boundary: string) =>
        `图中未绘制 ${points} 个点：已有 GPU 实测功耗，但缺少${latinGap(boundary)}${boundary}估算值。`,
      lines: (points: number, boundary: string) =>
        `${points} 个点只绘制在 GPU 实测功耗曲线上，没有${latinGap(boundary)}${boundary}曲线。`,
    },
    or: '或',
    colon: '：',
    separator: '、',
    count: (points: number) => `（${points}）`,
    unofficial: '非官方',
    showTable: '在表格中查看',
  },
} satisfies Record<Locale, unknown>;

/**
 * Names the points a modeled IT or facility series leaves out and why, so a missing point
 * reads differently from a missing benchmark. `onShowTable` links to a table whose status
 * column gives the reason per row; omit it where that table or the way back is missing.
 */
export function UnplottedPowerNote({
  summary,
  labelStyle,
  onShowTable,
}: {
  summary: UnplottedModeledPower;
  labelStyle: PowerBasisLabelStyle;
  onShowTable?: () => void;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const groups = summary.reasons;
  const points = groups.reduce((sum, group) => sum + group.points, 0);
  const boundary = summary.bases
    .map((basis) => powerBasisLabel(basis, locale, labelStyle))
    .join(t.or);
  return (
    <div
      data-testid="unplotted-power-note"
      data-missing={summary.missing}
      className="text-xs leading-5 text-muted-foreground"
    >
      <p>
        {t.heading[summary.missing](points, boundary)}
        {onShowTable && (
          <>
            {' '}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                track('inference_unplotted_power_table_opened', {
                  points,
                  reasons: groups.map((group) => group.reason).join(','),
                });
                onShowTable();
              }}
            >
              {t.showTable}
            </button>
          </>
        )}
      </p>
      <ul>
        {groups.map((group) => (
          <li key={group.reason} data-reason={group.reason}>
            <span className="font-medium text-foreground">
              {allInMeasuredReasonLabel(group.reason, locale)}
            </span>
            {t.colon}
            {group.chips.map((chip, index) => (
              <span key={`${chip.label}|${chip.overlayRunIndex ?? ''}`}>
                {index > 0 && t.separator}
                {chip.overlayRunIndex !== undefined && (
                  <span
                    aria-hidden="true"
                    data-testid="unplotted-power-run-swatch"
                    className="mr-1 inline-block size-2 rounded-full align-middle"
                    style={{ backgroundColor: overlayRunColor(chip.overlayRunIndex) }}
                  />
                )}
                {chip.label}
                {chip.overlayRunIndex !== undefined && ` · ${t.unofficial}`}
                {t.count(chip.points)}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
