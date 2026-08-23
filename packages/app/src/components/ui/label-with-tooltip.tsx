'use client';

import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { TooltipContent, TooltipRoot, TooltipTrigger } from '@/components/ui/tooltip';

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
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <Info className="size-3.5 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="top" collisionPadding={10}>
          <span>{tooltip}</span>
        </TooltipContent>
      </TooltipRoot>
    </div>
  );
}
