import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { fmtCostPerMtok, fmtGpuHour, fmtMs, fmtThroughput } from '@/components/live-seo/format';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import { getChipHw } from '@/lib/catalog/chip-pages';
import type { RunPageData } from '@/lib/live-seo/run-rankings-data.server';
import type { RunPageEntry } from '@/lib/live-seo/run-pages';

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
  priceTierLabels: Record<'hyperscaler' | 'retail', string>;
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
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              {t.backLabel}
            </Link>
            <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground">
              <span>{entry.model.label}</span>
              <span aria-hidden="true">&middot;</span>
              <span>
                {getChipHw(entry.chip).vendor} {getChipHw(entry.chip).arch}
              </span>
            </p>
            <h1 className="mt-3 max-w-4xl text-3xl font-semibold text-balance md:text-5xl md:tracking-heading">
              {t.heading}
            </h1>
          </header>

          {data.hasData ? (
            <>
              <section
                aria-labelledby="run-quick-answer"
                className="mt-8 rounded-xl border border-border/30 bg-card p-5 md:p-6"
              >
                <p id="run-quick-answer" className="text-xs font-medium text-muted-foreground">
                  {t.quickAnswerLabel}
                </p>
                <p className="mt-3 text-lg leading-relaxed font-medium text-pretty md:text-xl">
                  {t.quickAnswer}
                </p>
              </section>

              <dl aria-label={t.statConfigs} className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat boxed size="sm" label={t.statConfigs} value={data.configCount} />
                <Stat
                  boxed
                  size="sm"
                  label={t.statEngines}
                  value={data.frameworks.join(', ')}
                  valueClassName="whitespace-normal"
                />
                <Stat
                  boxed
                  size="sm"
                  label={t.statPrecisions}
                  value={data.precisions.join(', ').toUpperCase()}
                  valueClassName="whitespace-normal"
                />
                <Stat
                  boxed
                  size="sm"
                  label={t.statFreshness}
                  value={
                    data.oldest === data.newest ? data.newest : `${data.oldest} → ${data.newest}`
                  }
                  valueClassName="whitespace-normal"
                />
              </dl>

              <section
                aria-labelledby="run-ladder"
                className="mt-10 border-t border-border/30 pt-10"
              >
                <h2 id="run-ladder" className="text-xl font-semibold">
                  {t.ladderHeading}
                </h2>
                <p className="mt-3 leading-7 text-muted-foreground">{t.ladderIntro}</p>
                <div className="mt-4 overflow-x-auto rounded-xl border border-border/30">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead>
                      <tr className="border-b border-border/30 text-left text-xs font-medium text-muted-foreground">
                        <th scope="col" className="px-4 py-3">
                          {t.colTier}
                        </th>
                        <th scope="col" className="px-4 py-3 text-right">
                          {t.colThroughput}
                        </th>
                        <th scope="col" className="px-4 py-3 text-right">
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
                        <tr key={read.tier} className="border-b border-border/20 last:border-b-0">
                          <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                            {read.tier} tok/s
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                            {read.throughputPerGpu === null
                              ? '-'
                              : fmtThroughput(read.throughputPerGpu)}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
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
                  className="mt-10 border-t border-border/30 pt-10"
                >
                  <h2 id="run-cost" className="text-xl font-semibold">
                    {t.costHeading}
                  </h2>
                  <p className="mt-3 leading-7 text-muted-foreground">{t.costIntro}</p>
                  <div className="mt-4 overflow-x-auto rounded-xl border border-border/30">
                    <table className="w-full min-w-[28rem] text-sm">
                      <thead>
                        <tr className="border-b border-border/30 text-left text-xs font-medium text-muted-foreground">
                          <th scope="col" className="px-4 py-3">
                            {t.colPriceTier}
                          </th>
                          <th scope="col" className="px-4 py-3 text-right">
                            {t.colGpuHour}
                          </th>
                          <th scope="col" className="px-4 py-3 text-right">
                            {t.colCostPerMtok}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.costTiers.map((tier) => (
                          <tr
                            key={tier.tierLabel}
                            className="border-b border-border/20 last:border-b-0"
                          >
                            <td className="px-4 py-3 font-medium">
                              {t.priceTierLabels[tier.tierLabel]}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                              {fmtGpuHour(tier.costPerGpuHour)}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                              {fmtCostPerMtok(tier.costPerMtok)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <section aria-labelledby="run-faq" className="mt-10 border-t border-border/30 pt-10">
                <h2 id="run-faq" className="text-xl font-semibold">
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
            <EmptyState className="mt-10">{t.emptyState}</EmptyState>
          )}

          <section
            aria-labelledby="run-explore"
            className="mt-10 mb-16 border-t border-border/30 pt-10"
          >
            <h2 id="run-explore" className="text-xl font-semibold">
              {t.exploreHeading}
            </h2>
            <ul className="mt-3 space-y-2">
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

export function latencyQuote(data: RunPageData): { ttft: string; tpot: string } | null {
  if (data.bestMedianTtft === null || data.bestMedianTpot === null) return null;
  return { ttft: fmtMs(data.bestMedianTtft), tpot: fmtMs(data.bestMedianTpot) };
}
