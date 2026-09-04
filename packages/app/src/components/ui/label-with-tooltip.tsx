'use client';

import { type ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { InfoHelp } from '@/components/ui/option-info';

interface LabelWithTooltipProps {
  /**
   * Omit for controls that are not labelable elements — a segmented toggle is a
   * `role="tablist"`, so `for` would dangle and its `ariaLabel` is the accessible
   * name instead.
   */
  htmlFor?: string;
  label: string;
  tooltip: ReactNode;
}

export function LabelWithTooltip({ htmlFor, label, tooltip }: LabelWithTooltipProps) {
  return (
    <div className="flex items-start gap-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      <InfoHelp
        label={label}
        value={htmlFor ?? label}
        analyticsEvent="selector_help_opened"
        align="start"
      >
        {tooltip}
      </InfoHelp>
    </div>
  );
}
