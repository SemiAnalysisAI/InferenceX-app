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
      metrics={details.metrics}
      rows={details.rows}
      links={details.links.map((link) => ({ ...link, external: link.action === 'run' }))}
      onClose={onClose}
      onAction={onAction}
    >
      {details.powerHtml && (
        <div className="mt-3" dangerouslySetInnerHTML={{ __html: details.powerHtml }} />
      )}
      {details.image && (
        <p className="mt-3 break-all whitespace-pre-line text-2xs text-muted-foreground">
          {details.image}
        </p>
      )}
    </ChartPointDetails>
  );
}
