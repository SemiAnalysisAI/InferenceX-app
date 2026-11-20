'use client';

import type * as React from 'react';
import { useEffect, useRef } from 'react';

import { ChartPointDetails } from '@/components/ui/chart-point-details';
import type { PointDetailAction, PointDetails } from '@/components/inference/utils/tooltipUtils';

interface PointDetailsPanelProps {
  details: PointDetails;
  color: string;
  onClose: () => void;
  onAction?: (action: PointDetailAction, event: React.MouseEvent<HTMLElement>) => void;
  /**
   * Called once the panel goes away (close, Escape, an outside or empty-plot click), so a
   * page that mirrors the pinned point can drop it too. Switching points keeps the panel.
   */
  onRelease?: () => void;
}

export function PointDetailsPanel({
  details,
  color,
  onClose,
  onAction,
  onRelease,
}: PointDetailsPanelProps) {
  const onReleaseRef = useRef(onRelease);
  onReleaseRef.current = onRelease;
  useEffect(() => () => onReleaseRef.current?.(), []);
  return (
    <ChartPointDetails
      title={details.title}
      subtitle={details.subtitle}
      color={color}
      date={details.date}
      warning={details.unofficial}
      metrics={[]}
      links={details.links.map((link) => ({ ...link, external: link.action === 'run' }))}
      onClose={onClose}
      onAction={onAction}
    >
      <div
        className="inferencex-pinned-tooltip"
        dangerouslySetInnerHTML={{ __html: details.html }}
      />
    </ChartPointDetails>
  );
}
