'use client';

import { useGlobalFilterSelection, useGlobalFilterActions } from '@/components/GlobalFilterContext';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { InfoHelp } from '@/components/ui/option-info';
import { track } from '@/lib/analytics';
import { getGpuSpecs } from '@/lib/constants';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    label: 'TPU TCO assumption',
    external: 'External',
    internal: 'Internal',
    note: 'USD per physical chip/hour. External customer pricing or internal owner cost.',
  },
  zh: {
    label: 'TPU TCO 假设',
    external: '外部',
    internal: '内部',
    note: '单位：美元/物理芯片/小时。可选择外部客户价格或内部自有成本。',
  },
} as const;

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
  if (!visible) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1" data-testid="tpu-tco-assumptions">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>{t.label}</span>
        <InfoHelp
          label={t.label}
          value="tpu-tco"
          align="start"
          analyticsEvent="selector_help_opened"
        >
          {t.note}
        </InfoHelp>
      </div>
      <SegmentedToggle
        className={className}
        role="group"
        value={tcoBasis}
        options={[
          {
            value: 'external' as const,
            label: `${t.external} · $${getGpuSpecs('tpuv7', 'external').costh.toFixed(2)}`,
            testId: 'tco-basis-external',
          },
          {
            value: 'internal' as const,
            label: `${t.internal} · $${getGpuSpecs('tpuv7', 'internal').costh.toFixed(2)}`,
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
