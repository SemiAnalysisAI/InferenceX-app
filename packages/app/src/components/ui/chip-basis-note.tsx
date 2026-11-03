'use client';

import type { ChipBasis } from '@/lib/benchmarks/chip-basis';
import { ChipBasisToggle } from '@/components/ui/chip-basis-toggle';

export interface ChipBasisControl {
  value: ChipBasis;
  onChange: (basis: ChipBasis) => void;
  /** Analytics `source` for the toggle. */
  source: string;
}

/**
 * Collapsible note explaining a disaggregated throughput basis, with the toggle
 * that switches it. Amber while the per-pool basis makes the comparison uneven,
 * blue once every chip is the denominator.
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
  const totalBasis = chipBasis.value === 'total';
  return (
    <div
      className={`overflow-hidden transition-all duration-200 ease-in-out ${
        visible ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
      }`}
    >
      <div
        data-testid={testId}
        data-chip-basis={chipBasis.value}
        className={`text-muted-foreground text-xs mt-2 border-l-2 pl-2 py-1 ${
          totalBasis ? 'border-sky-500 bg-sky-500/5' : 'border-amber-500 bg-amber-500/5'
        }`}
      >
        <p>
          <strong>{label}</strong>
          {text}
        </p>
        {visible && showToggle && (
          <ChipBasisToggle
            value={chipBasis.value}
            onValueChange={chipBasis.onChange}
            source={chipBasis.source}
            className="mt-1"
          />
        )}
      </div>
    </div>
  );
}
