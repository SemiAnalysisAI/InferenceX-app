'use client';

import type * as React from 'react';

import { ChartPointDetails } from '@/components/ui/chart-point-details';
import type { PointDetailAction, PointDetails } from '@/components/inference/utils/tooltipUtils';

interface PointDetailsPanelProps {
  details: PointDetails;
  color: string;
  onClose: () => void;
  onAction?: (action: PointDetailAction, event: React.MouseEvent<HTMLElement>) => void;
}

export function PointDetailsPanel({ details, color, onClose, onAction }: PointDetailsPanelProps) {
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
