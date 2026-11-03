import {
  buildPointDetails,
  type PointDetails,
  type TooltipConfig,
} from '@/components/inference/utils/tooltipUtils';

const colon = (label: string) => (/[\u4E00-\u9FFF]/u.test(label) ? '：' : ':');

export function pointDetailsText(details: PointDetails): string {
  return [
    details.unofficial,
    details.title,
    details.subtitle,
    details.date,
    ...details.metrics.map((metric) => `${metric.label}${colon(metric.label)} ${metric.value}`),
    ...details.rows.map((row) => `${row.label}${colon(row.label)} ${row.value}`),
    details.image,
    details.powerHtml,
    ...details.links.map(
      (link) => `data-action="${link.action}" href="${link.href ?? ''}" ${link.label}`,
    ),
  ]
    .filter(Boolean)
    .join('\n');
}

export const detailsText = (config: TooltipConfig): string =>
  pointDetailsText(buildPointDetails(config));

export const comparisonDetailsText = (config: TooltipConfig): string =>
  detailsText({ ...config, comparisonDate: true });
