'use client';

import { ArrowRight } from 'lucide-react';

import { track } from '@/lib/analytics';

import { HwVendorLogo } from '@/components/ui/hw-vendor-logo';

/** One side of the "A vs B" pair: display label plus vendor for the logo. */
interface PairHardware {
  label: string;
  vendor?: string;
}

interface ComparePairCardLinkProps {
  href: string;
  slug: string;
  label: string;
  archLine: string;
  scenarioLabel?: 'AgentX' | '8K→1K';
  /** When both sides are provided, the title renders each hardware label with
   *  its vendor logo beside it instead of the plain `label` string. */
  hardwareA?: PairHardware;
  hardwareB?: PairHardware;
}

export function ComparePairCardLink({
  href,
  slug,
  label,
  archLine,
  scenarioLabel,
  hardwareA,
  hardwareB,
}: ComparePairCardLinkProps) {
  return (
    <a
      href={href}
      data-scenario={scenarioLabel}
      className="group relative flex flex-col rounded-xl border border-border bg-background/20 backdrop-blur-[2px] p-5 transition-all duration-200 hover:border-brand/50 hover:shadow-lg hover:shadow-brand/5 hover:scale-[1.01]"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        track('compare_index_pair_clicked', {
          slug,
          label,
          ...(scenarioLabel ? { scenario: scenarioLabel } : {}),
        });
        window.location.href = href;
      }}
    >
      <div className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-brand/60 transition-all duration-200 group-hover:bg-brand group-hover:inset-y-2" />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-sm leading-tight group-hover:text-brand transition-colors duration-200">
              {hardwareA && hardwareB ? (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <HwVendorLogo vendor={hardwareA.vendor} />
                    {hardwareA.label}
                  </span>{' '}
                  <span className="font-normal text-muted-foreground">vs</span>{' '}
                  <span className="inline-flex items-center gap-1.5">
                    <HwVendorLogo vendor={hardwareB.vendor} />
                    {hardwareB.label}
                  </span>
                </>
              ) : (
                label
              )}
            </h3>
            {scenarioLabel && (
              <span className="inline-flex min-h-5 items-center rounded-full border border-brand/30 bg-brand/10 px-2 font-mono text-3xs font-semibold leading-none text-brand">
                {scenarioLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">{archLine}</p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-brand" />
      </div>
    </a>
  );
}
