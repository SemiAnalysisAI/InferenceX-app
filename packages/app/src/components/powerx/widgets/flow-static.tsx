import type { Locale } from '@/lib/i18n/i18n';

import { DEFAULT_FLOW_NODE, FlowSvg, STATIC_PALETTE } from './flow-svg';

export const FLOW_SVG_EXPORT_WIDTH = 1100;

/** The GitHub fallback: the same component, literal colours, no handlers. */
export function renderStaticFlowSvg(locale: Locale) {
  return (
    <FlowSvg
      locale={locale}
      width={FLOW_SVG_EXPORT_WIDTH}
      orientation="horizontal"
      palette={STATIC_PALETTE}
      active={DEFAULT_FLOW_NODE}
    />
  );
}
