import {
  buildPointDetails,
  type PointDetails,
  type TooltipConfig,
} from '@/components/inference/utils/tooltipUtils';

export const htmlText = (html: string): string =>
  html
    .split(/<[^>]*>/u)
    .join('')
    .replaceAll(/\s+/gu, ' ');

export function pointDetailsText(details: PointDetails): string {
  return [
    details.unofficial,
    details.title,
    details.subtitle,
    details.date,
    htmlText(details.html),
    ...details.links.map(
      (link) => `data-action="${link.action}" href="${link.href ?? ''}" ${link.label}`,
    ),
  ]
    .filter(Boolean)
    .join('\n');
}

export const detailsText = (config: TooltipConfig): string =>
  pointDetailsText(buildPointDetails(config));

export const detailsHtml = (config: TooltipConfig): string => buildPointDetails(config).html;

export const comparisonDetailsText = (config: TooltipConfig): string =>
  detailsText({ ...config, comparisonDate: true });
