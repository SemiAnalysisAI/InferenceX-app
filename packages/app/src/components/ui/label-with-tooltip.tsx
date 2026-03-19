'use client';

import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { TooltipContent, TooltipRoot, TooltipTrigger } from '@/components/ui/tooltip';

interface LabelWithTooltipProps {
  htmlFor: string;
  label: string;
  tooltip: ReactNode;
}

export function LabelWithTooltip({ htmlFor, label, tooltip }: LabelWithTooltipProps) {
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="top" collisionPadding={10}>
          <span>{tooltip}</span>
        </TooltipContent>
      </TooltipRoot>
    </div>
  );
}
