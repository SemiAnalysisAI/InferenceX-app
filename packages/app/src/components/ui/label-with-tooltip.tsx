'use client';

import { type ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { InfoHelp } from '@/components/ui/option-info';

interface LabelWithTooltipProps {
  htmlFor?: string;
  label: string;
  shortLabel?: string;
  tooltip: ReactNode;
}

export function LabelWithTooltip({ htmlFor, label, shortLabel, tooltip }: LabelWithTooltipProps) {
  return (
    <div className="flex items-start gap-1">
      {shortLabel ? (
        <Label htmlFor={htmlFor} aria-label={label} className="whitespace-nowrap">
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </Label>
      ) : (
        <Label htmlFor={htmlFor}>{label}</Label>
      )}
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
