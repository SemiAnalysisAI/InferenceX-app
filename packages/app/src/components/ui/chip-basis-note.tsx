'use client';

import type { ChipBasis } from '@/lib/benchmarks/chip-basis';
import { ChipBasisToggle } from '@/components/ui/chip-basis-toggle';

export interface ChipBasisControl {
  value: ChipBasis;
  onChange: (basis: ChipBasis) => void;
  /** Analytics `source` for the toggle. */
  source: string;
  /** Describe the basis without offering the toggle (embeds). */
  readOnly?: boolean;
}

/**
 * Collapsible note explaining a disaggregated throughput basis, with the toggle
 * that switches it.
 */
export function ChipBasisNote({
  visible,
  label,
  text,
  chipBasis,
  testId,
  showToggle = true,
}: {
  visible: boolean;
  label: string;
  text: string;
  chipBasis: ChipBasisControl;
  testId?: string;
  /** False where the current selection does not depend on the basis. */
  showToggle?: boolean;
}) {
  return (
    <div
      aria-hidden={visible ? undefined : true}
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
        visible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          data-testid={testId}
          data-chip-basis={chipBasis.value}
          className="mt-2 text-xs text-muted-foreground"
        >
          <p>
            <span className="font-medium text-foreground">{label}</span>
            {text}
          </p>
          {visible && showToggle && !chipBasis.readOnly && (
            <ChipBasisToggle
              value={chipBasis.value}
              onValueChange={chipBasis.onChange}
              source={chipBasis.source}
              className="mt-1.5"
            />
          )}
        </div>
      </div>
    </div>
  );
}
