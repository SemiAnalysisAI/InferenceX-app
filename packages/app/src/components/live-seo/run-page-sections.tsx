/**
 * Shared server-rendered body for `/run/<pair>` and `/zh/run/<pair>`.
 * One markup tree, two string bundles — the EN and ZH routes cannot drift.
 * All numbers come pre-derived from `getRunPageData`, which reads through the
 * same cached benchmark query the dashboard renders.
 */

import Link from 'next/link';

import { fmtCostPerMtok, fmtGpuHour, fmtMs, fmtThroughput } from '@/components/live-seo/format';
import { getChipHw } from '@/lib/chip-pages';
import type { RunPageData } from '@/lib/run-rankings-data.server';
import type { RunPageEntry } from '@/lib/run-pages';

export interface RunStrings {
  backHref: string;
  backLabel: string;
  heading: string;
  quickAnswerLabel: string;
  quickAnswer: string;
  statConfigs: string;
  statEngines: string;
  statPrecisions: string;
  statFreshness: string;
  ladderHeading: string;
  ladderIntro: string;
  colTier: string;
  colThroughput: string;
  colCost: string;
  colEngine: string;
  colPrecision: string;
  costHeading: string;
  costIntro: string;
  colPriceTier: string;
  colGpuHour: string;
  colCostPerMtok: string;
  priceTierLabels: Record<'hyperscaler' | 'neocloud' | 'retail', string>;
  emptyState: string;
  faqHeading: string;
  faq: { question: string; answer: string }[];
  exploreHeading: string;
  exploreLinks: { href: string; label: string }[];
}

export function RunDetailContent({
  entry,
  data,
  t,
}: {
  entry: RunPageEntry;
  data: RunPageData;
  t: RunStrings;
}) {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8">
        <article className="mx-auto max-w-5xl">
          <header className="pt-8 md:pt-12">
            <Link
              href={t.backHref}
              className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-brand"
            >
              <span
                aria-hidden="true"
                className="transition-transform group-hover:-translate-x-0.5"
              >
                ←
              </span>
              {t.backLabel}
            </Link>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-brand/25 bg-brand/8 px-3 py-1 text-xs font-semibold tracking-eyebrow text-brand uppercase">
                {entry.model.label}
              </span>
              <span className="font-mono text-xs tracking-eyebrow text-muted-foreground uppercase">
                {getChipHw(entry.chip).vendor} {getChipHw(entry.chip).arch}
              </span>
            </div>
            <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-heading text-balance md:text-5xl">
              {t.heading}
            </h1>
          </header>

          {data.hasData ? (
            <>
              <section
                aria-labelledby="run-quick-answer"
                className="mt-8 rounded-xl border border-brand/20 bg-brand/6 p-5 md:p-6"
              >
                <p
                  id="run-quick-answer"
                  className="font-mono text-xs font-semibold tracking-eyebrow text-brand uppercase"
                >
                  {t.quickAnswerLabel}
                </p>
                <p className="mt-3 text-lg leading-relaxed font-medium text-pretty md:text-xl">
                  {t.quickAnswer}
                </p>
              </section>

              <section
                aria-label={t.statConfigs}
                className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              >
                <div className="rounded-xl border border-border/50 p-4">
                  <p className="text-xs tracking-widest text-muted-foreground uppercase">
                    {t.statConfigs}
                  </p>
                  <p className="mt-1 font-mono text-2xl font-semibold">{data.configCount}</p>
                </div>
                <div className="rounded-xl border border-border/50 p-4">
                  <p className="text-xs tracking-widest text-muted-foreground uppercase">
                    {t.statEngines}
                  </p>
                  <p className="mt-1 text-sm leading-6 font-medium">{data.frameworks.join(', ')}</p>
                </div>
                <div className="rounded-xl border border-border/50 p-4">
                  <p className="text-xs tracking-widest text-muted-foreground uppercase">
                    {t.statPrecisions}
                  </p>
                  <p className="mt-1 text-sm leading-6 font-medium uppercase">
                    {data.precisions.join(', ')}
                  </p>
                </div>
                <div className="rounded-xl border border-border/50 p-4">
                  <p className="text-xs tracking-widest text-muted-foreground uppercase">
                    {t.statFreshness}
                  </p>
                  <p className="mt-1 font-mono text-sm leading-6 font-medium">
                    {data.oldest} → {data.newest}
                  </p>
                </div>
              </section>

              <section
                aria-labelledby="run-ladder"
                className="mt-10 border-t border-border/50 pt-10"
              >
                <h2 id="run-ladder" className="text-xl font-semibold tracking-tight">
                  {t.ladderHeading}
                </h2>
                <p className="mt-3 leading-7 text-muted-foreground">{t.ladderIntro}</p>
                <div className="mt-4 overflow-x-auto rounded-xl border border-border/50">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-left text-xs tracking-widest text-muted-foreground uppercase">
                        <th scope="col" className="px-4 py-3">
                          {t.colTier}
                        </th>
                        <th scope="col" className="px-4 py-3">
                          {t.colThroughput}
                        </th>
                        <th scope="col" className="px-4 py-3">
                          {t.colCost}
                        </th>
                        <th scope="col" className="px-4 py-3">
                          {t.colEngine}
                        </th>
                        <th scope="col" className="px-4 py-3">
                          {t.colPrecision}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.tierLadder.map((read) => (
                        <tr key={read.tier} className="border-b border-border/30 last:border-b-0">
                          <td className="px-4 py-3 font-mono">{read.tier} tok/s</td>
                          <td className="px-4 py-3 font-mono">
                            {read.throughputPerGpu === null
                              ? '-'
                              : fmtThroughput(read.throughputPerGpu)}
                          </td>
                          <td className="px-4 py-3 font-mono">
                            {read.costPerMtok === null ? '-' : fmtCostPerMtok(read.costPerMtok)}
                          </td>
                          <td className="px-4 py-3">{read.framework ?? '-'}</td>
                          <td className="px-4 py-3 uppercase">{read.precision ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {data.costTiers.length > 0 && (
                <section
                  aria-labelledby="run-cost"
                  className="mt-10 border-t border-border/50 pt-10"
                >
                  <h2 id="run-cost" className="text-xl font-semibold tracking-tight">
                    {t.costHeading}
                  </h2>
                  <p className="mt-3 leading-7 text-muted-foreground">{t.costIntro}</p>
                  <div className="mt-4 overflow-x-auto rounded-xl border border-border/50">
                    <table className="w-full min-w-[28rem] text-sm">
                      <thead>
                        <tr className="border-b border-border/50 text-left text-xs tracking-widest text-muted-foreground uppercase">
                          <th scope="col" className="px-4 py-3">
                            {t.colPriceTier}
                          </th>
                          <th scope="col" className="px-4 py-3">
                            {t.colGpuHour}
                          </th>
                          <th scope="col" className="px-4 py-3">
                            {t.colCostPerMtok}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.costTiers.map((tier) => (
                          <tr
                            key={tier.tierLabel}
                            className="border-b border-border/30 last:border-b-0"
                          >
                            <td className="px-4 py-3 font-medium">
                              {t.priceTierLabels[tier.tierLabel]}
                            </td>
                            <td className="px-4 py-3 font-mono">
                              {fmtGpuHour(tier.costPerGpuHour)}
                            </td>
                            <td className="px-4 py-3 font-mono">
                              {fmtCostPerMtok(tier.costPerMtok)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <section aria-labelledby="run-faq" className="mt-10 border-t border-border/50 pt-10">
                <h2 id="run-faq" className="text-xl font-semibold tracking-tight">
                  {t.faqHeading}
                </h2>
                <dl className="mt-4 space-y-6">
                  {t.faq.map((item) => (
                    <div key={item.question}>
                      <dt className="font-medium">{item.question}</dt>
                      <dd className="mt-2 leading-7 text-muted-foreground">{item.answer}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </>
          ) : (
            <p className="mt-10 mb-16 rounded-xl border border-border/50 p-6 leading-7 text-muted-foreground">
              {t.emptyState}
            </p>
          )}

          <section
            aria-labelledby="run-explore"
            className="mt-10 mb-16 rounded-xl border border-brand/20 bg-brand/6 p-5 md:p-6"
          >
            <h2 id="run-explore" className="text-xl font-semibold tracking-tight">
              {t.exploreHeading}
            </h2>
            <ul className="mt-3 space-y-1">
              {t.exploreLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm font-medium text-brand hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </article>
      </div>
    </main>
  );
}

/**
 * Formatted best-of-config TTFT and TPOT for the quick answers. Returned as
 * separate values because each is minimized independently across configs:
 * the two bests can come from different runs, so composing them as a single
 * measured pair would misstate the data.
 */
export function latencyQuote(data: RunPageData): { ttft: string; tpot: string } | null {
  if (data.bestMedianTtft === null || data.bestMedianTpot === null) return null;
  return { ttft: fmtMs(data.bestMedianTtft), tpot: fmtMs(data.bestMedianTpot) };
}
