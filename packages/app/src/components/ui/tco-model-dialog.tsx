'use client';

import { TCO_MODEL_TITLE, TCO_SOURCE_URL } from '@semianalysisai/inferencex-constants';
import { ArrowUpRight, Lock } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

import type { Locale } from '@/lib/i18n';

import {
  LOCKED_RENT_TIERS,
  lockedTierLabel,
  lockedTierValue,
  parseLockedTierValue,
  type LockedRentTier,
} from './locked-rent-tiers';

const STRINGS = {
  en: {
    lockedTitle: 'Available in the SemiAnalysis AI Cloud TCO Model',
    locked: 'Locked',
    title: (tier: string) => `${tier} pricing is in the ${TCO_MODEL_TITLE}`,
    lead: (tier: string) =>
      `InferenceX publishes two TCO tiers: Owning at Large Hyperscaler Volume and Rent - 3 Year Commit. ${tier} and the other rental terms come from the same source, the SemiAnalysis ${TCO_MODEL_TITLE}.`,
    includesHeading: 'What the model covers',
    includes: [
      'Current market GPU rental prices and their variation across on-demand, 1 month, 6 month, 1 year, 2 year and 3 year terms.',
      'All-in $/GPU/hr cost of ownership built from server capex, networking, colocation, power and cost of capital, per accelerator across NVIDIA, AMD, TPU and Trainium.',
      'Forward rental price scenarios from supply-demand analysis and the cost curve of upcoming accelerator generations.',
      'A cluster finance suite: NPV, residual value, IRR, and a full three-statement model that the rental scenarios feed into.',
    ],
    delivery:
      'Delivered as an Excel workbook with dashboard access, one year of quarterly updates, and onboarding and ad-hoc analyst calls. Sold separately from the SemiAnalysis newsletter.',
    cta: 'Explore the AI Cloud TCO Model',
    dismiss: 'Not now',
  },
  zh: {
    lockedTitle: '包含在 SemiAnalysis AI Cloud TCO 模型中',
    locked: '已锁定',
    title: (tier: string) => `${tier}价格包含在 ${TCO_MODEL_TITLE} 中`,
    lead: (tier: string) =>
      `InferenceX 公开两档 TCO：自有（超大规模云大批量）与租赁 - 3 年承诺。${tier}及其他租赁期限的价格来自同一来源：SemiAnalysis ${TCO_MODEL_TITLE}。`,
    includesHeading: '模型包含的内容',
    includes: [
      '当前市场 GPU 租赁价格及其在按需、1 个月、6 个月、1 年、2 年和 3 年期限之间的差异。',
      '按加速器计算的全口径 $/GPU/hr 拥有成本，涵盖服务器资本开支、网络、托管、电力和资金成本，覆盖 NVIDIA、AMD、TPU 与 Trainium。',
      '基于供需分析和下一代加速器成本曲线的租赁价格前瞻情景。',
      '集群财务套件：NPV、残值、IRR，以及由租赁情景驱动的完整三表模型。',
    ],
    delivery:
      '以 Excel 工作簿加仪表板形式交付，含一年季度更新、上手培训以及按需分析师沟通。与 SemiAnalysis 通讯订阅分开销售。',
    cta: '了解 AI Cloud TCO 模型',
    dismiss: '暂不需要',
  },
} as const;

/** Trailing lock glyph for selector options whose pricing lives in the TCO model. */
export function LockedTierBadge({ className }: { className?: string }) {
  const t = STRINGS[useLocale()];
  return (
    <span
      className={cn('inline-flex shrink-0 items-center text-muted-foreground', className)}
      title={t.lockedTitle}
      data-testid="locked-tier-badge"
    >
      <Lock aria-hidden="true" className="size-3.5" />
      <span className="sr-only">{t.locked}</span>
    </span>
  );
}

interface TcoModelDialogProps {
  /** Tier the reader clicked; null keeps the dialog closed. */
  tier: LockedRentTier | null;
  onClose: () => void;
  /** Analytics surface, e.g. "yaxis_metric" or "profit_cost_provider". */
  source: string;
}

/**
 * Modal that opens when a locked rental tier is picked. It plugs the
 * SemiAnalysis AI Cloud TCO Model, where those rental rates are published.
 */
export function TcoModelDialog({ tier, onClose, source }: TcoModelDialogProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const tierLabel = tier ? lockedTierLabel(tier, locale) : '';

  return (
    <Dialog open={tier !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl" data-testid="tco-model-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Lock aria-hidden="true" className="size-3.5" />
            SemiAnalysis
          </div>
          <DialogTitle>{t.title(tierLabel)}</DialogTitle>
          <DialogDescription>{t.lead(tierLabel)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="font-medium">{t.includesHeading}</p>
          <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
            {t.includes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="text-muted-foreground">{t.delivery}</p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>
            {t.dismiss}
          </Button>
          <Button asChild>
            <a
              href={TCO_SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="tco-model-dialog-link"
              onClick={() =>
                track('tco_model_dialog_link_clicked', { source, tier: tier?.id ?? null })
              }
            >
              {t.cta}
              <ArrowUpRight aria-hidden="true" />
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * State for a selector that mixes real options with locked rental tiers.
 * `interceptLocked(value)` returns true (and opens the dialog) when the value
 * is a locked tier, so callers can bail before writing to their own state.
 */
export function useLockedTierDialog(source: string): {
  lockedTier: LockedRentTier | null;
  interceptLocked: (value: string) => boolean;
  dialog: ReactNode;
} {
  const [lockedTier, setLockedTier] = useState<LockedRentTier | null>(null);
  const interceptLocked = useCallback(
    (value: string) => {
      const tier = parseLockedTierValue(value);
      if (!tier) return false;
      setLockedTier(tier);
      track('tco_model_dialog_opened', { source, tier: tier.id });
      return true;
    },
    [source],
  );
  const close = useCallback(() => setLockedTier(null), []);
  return {
    lockedTier,
    interceptLocked,
    dialog: <TcoModelDialog tier={lockedTier} onClose={close} source={source} />,
  };
}

/**
 * Locked rental tiers shaped as `MultiSelect` options for the calculator
 * Cost Provider selectors. The caller runs `interceptLocked` in `onChange`.
 */
export function lockedCostProviderOptions(locale: Locale): {
  value: string;
  label: string;
  badge: ReactNode;
  testId: string;
}[] {
  return LOCKED_RENT_TIERS.map((tier) => ({
    value: lockedTierValue(tier.id),
    label: lockedTierLabel(tier, locale),
    badge: <LockedTierBadge />,
    testId: `cost-provider-locked-${tier.id}`,
  }));
}

export { LOCKED_RENT_TIERS };
