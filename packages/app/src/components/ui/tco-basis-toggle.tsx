'use client';

import { useGlobalFilterSelection, useGlobalFilterActions } from '@/components/GlobalFilterContext';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { track } from '@/lib/analytics';
import { showsTcoBasisSelector } from '@/lib/data-mappings';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    label: 'TCO Basis',
    external: 'External',
    internal: 'Internal',
    note: 'USD per physical chip/hour. External customer pricing or internal owner cost.',
  },
  zh: {
    label: 'TCO 口径',
    external: '外部',
    internal: '内部',
    note: '单位：美元/物理芯片/小时。可选择外部客户价格或内部自有成本。',
  },
} as const;

export function useShowsTcoBasisSelector(): boolean {
  const { selectedModel, effectiveSequence } = useGlobalFilterSelection();
  return showsTcoBasisSelector(selectedModel, effectiveSequence);
}

/** Show only for TPU hardware that survives the current filters, including overlays. */
export function TcoBasisToggle({
  visible = true,
  source,
  className,
}: {
  visible?: boolean;
  source: string;
  className?: string;
}) {
  const { tcoBasis } = useGlobalFilterSelection();
  const { setTcoBasis } = useGlobalFilterActions();
  const t = STRINGS[useLocale()];
  const showsTcoBasis = useShowsTcoBasisSelector();
  if (!visible || !showsTcoBasis) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-testid="tpu-tco-assumptions">
      <LabelWithTooltip label={t.label} tooltip={t.note} />
      <SegmentedToggle
        className={className}
        size="default"
        buttonClassName="flex-1 justify-center"
        role="group"
        value={tcoBasis}
        options={[
          {
            value: 'external' as const,
            label: t.external,
            testId: 'tco-basis-external',
          },
          {
            value: 'internal' as const,
            label: t.internal,
            testId: 'tco-basis-internal',
          },
        ]}
        onValueChange={(basis) => {
          setTcoBasis(basis);
          track('tco_basis_changed', { basis, source });
        }}
        ariaLabel={t.label}
        testId="tco-basis-toggle"
      />
    </div>
  );
}
