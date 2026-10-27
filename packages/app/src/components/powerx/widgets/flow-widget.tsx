'use client';

import { useId, useState } from 'react';

import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { track } from '@/lib/analytics/analytics';

import { DEFAULT_FLOW_NODE, FLOW_STRINGS, type FlowNode, FlowSvg } from './flow-svg';
import { GrammarLegend, WidgetFrame, type WidgetProps } from './widget-chrome';

const VERTICAL_BELOW_PX = 640;

export function FlowWidget({ locale, alt }: WidgetProps) {
  const t = FLOW_STRINGS[locale];
  const { setContainerRef, dimensions } = useResponsiveChartDimensions({ height: 1 });
  const width = Math.max(dimensions.width, 280);
  const [pinned, setPinned] = useState<FlowNode>(DEFAULT_FLOW_NODE);
  const [hovered, setHovered] = useState<FlowNode | null>(null);
  const active = hovered ?? pinned;
  const captionId = useId();

  return (
    <WidgetFrame name="flow" alt={alt}>
      <div ref={setContainerRef} className="min-w-0" onMouseLeave={() => setHovered(null)}>
        {dimensions.width > 0 && (
          <FlowSvg
            locale={locale}
            width={width}
            orientation={width < VERTICAL_BELOW_PX ? 'vertical' : 'horizontal'}
            active={active}
            onActivate={setHovered}
            onSelect={(node) => {
              setPinned(node);
              track('powerx_tutorial_flow_node', { value: node });
            }}
            describedBy={captionId}
          />
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <p
          id={captionId}
          aria-live="polite"
          data-testid="powerx-flow-caption"
          className="max-w-[64ch] min-h-12 text-sm leading-6 text-muted-foreground"
        >
          <span className="font-semibold text-foreground">{t.nodes[active][0]}.</span>{' '}
          {t.sentences[active]}
        </p>
        <GrammarLegend locale={locale} color="var(--brand)" className="shrink-0" />
      </div>
    </WidgetFrame>
  );
}
