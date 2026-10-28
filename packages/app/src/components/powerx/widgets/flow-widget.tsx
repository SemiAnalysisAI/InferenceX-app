'use client';

import { type CSSProperties, useId, useState } from 'react';

import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { track } from '@/lib/analytics/analytics';

import {
  DEFAULT_FLOW_NODE,
  FLOW_NODES,
  FLOW_STRINGS,
  type FlowNode,
  flowLayout,
  FlowSvg,
} from './flow-svg';
import { GrammarLegend, WidgetFrame, type WidgetProps } from './widget-chrome';

const VERTICAL_BELOW_PX = 640;
/** The diagram's height depends only on its orientation, so CSS can reserve it before measuring. */
const RESERVE = {
  '--flow-vertical': `${flowLayout(VERTICAL_BELOW_PX - 1, 'vertical').height}px`,
  '--flow-horizontal': `${flowLayout(VERTICAL_BELOW_PX, 'horizontal').height}px`,
} as CSSProperties;

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
      <div
        ref={setContainerRef}
        className="@container min-w-0"
        onMouseLeave={() => setHovered(null)}
      >
        <div
          style={RESERVE}
          className="min-h-(--flow-vertical) @min-[640px]:min-h-(--flow-horizontal)"
        >
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
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        {/*
          Every sentence shares one cell, so hovering keeps the tallest one's box. The visible
          sentence remounts on each change because text rewritten in place counts as a shift.
        */}
        <div
          aria-live="polite"
          className="grid max-w-[64ch] text-sm leading-6 text-muted-foreground"
        >
          {FLOW_NODES.map((node) => (
            <p key={node} aria-hidden className="invisible [grid-area:1/1]">
              <span className="font-semibold">{t.nodes[node][0]}.</span> {t.sentences[node]}
            </p>
          ))}
          <p
            key={active}
            id={captionId}
            data-testid="powerx-flow-caption"
            className="[grid-area:1/1]"
          >
            <span className="font-semibold text-foreground">{t.nodes[active][0]}.</span>{' '}
            {t.sentences[active]}
          </p>
        </div>
        <GrammarLegend locale={locale} color="var(--brand)" className="shrink-0" />
      </div>
    </WidgetFrame>
  );
}
