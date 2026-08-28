/**
 * Shared server-rendered body for `/rankings/<slug>` and `/zh/rankings/<slug>`.
 * One markup tree, two string bundles — the EN and ZH routes cannot drift.
 * All numbers come pre-derived from `getRankingPageData`, which reads the
 * exact cells the /overview leaderboard renders.
 */

import Link from 'next/link';

import { fmtCostPerMtok, fmtThroughput, pctCheaper, pctFaster } from '@/components/live-seo/format';
import type { RankingPageData } from '@/lib/run-rankings-data.server';
import type { RankingPageEntry, RankingRow } from '@/lib/rankings';
import { getRunPageEntry } from '@/lib/run-pages';

export interface RankingsStrings {
  backLabel: string;
  heading: string;
  scenarioNote: string;
  tableCaption: string;
  colRank: string;
  colGpu: string;
  colThroughput: string;
  colCost: string;
  colPrecision: string;
  colEngine: string;
  emptyState: string;
  siblingLead: string;
  siblingLabel: string;
  methodologyHeading: string;
  methodologyBody: string[];
  faqHeading: string;
  faq: { question: string; answer: string }[];
  exploreHeading: string;
  exploreLinks: { href: string; label: string }[];
}

function leadSentence(rows: RankingRow[], entry: RankingPageEntry, zh: boolean): string {
  if (rows.length < 2) return '';
  const [first, second] = rows;
  if (entry.kind === 'fastest-gpu' && first.throughputPerGpu && second.throughputPerGpu) {
    const pct = pctFaster(first.throughputPerGpu, second.throughputPerGpu);
    const lead = `${first.hardwareLabel} leads at ${fmtThroughput(first.throughputPerGpu)} tokens/s per GPU, ${pct}% ahead of ${second.hardwareLabel}.`;
    const leadZh = `${first.hardwareLabel} 以单 GPU 每秒 ${fmtThroughput(first.throughputPerGpu)} token 领先，比第二名 ${second.hardwareLabel} 高 ${pct}%。`;
    return zh ? leadZh : lead;
  }
  if (entry.kind === 'cheapest-gpu' && first.costPerMtok && second.costPerMtok) {
    const pct = pctCheaper(first.costPerMtok, second.costPerMtok);
    const lead = `${first.hardwareLabel} is the cheapest at ${fmtCostPerMtok(first.costPerMtok)} per million tokens, ${pct}% below ${second.hardwareLabel}.`;
    const leadZh = `${first.hardwareLabel} 成本最低，每百万 token 仅 ${fmtCostPerMtok(first.costPerMtok)}，比第二名 ${second.hardwareLabel} 低 ${pct}%。`;
    return zh ? leadZh : lead;
  }
  return '';
}

export function rankingsLeadSentence(
  rows: RankingRow[],
  entry: RankingPageEntry,
  locale: 'en' | 'zh',
): string {
  return leadSentence(rows, entry, locale === 'zh');
}

export function RankingsDetailContent({
  entry,
  data,
  t,
  locale,
}: {
  entry: RankingPageEntry;
  data: RankingPageData;
  t: RankingsStrings;
  locale: 'en' | 'zh';
}) {
  const prefix = locale === 'zh' ? '/zh' : '';
  const lead = rankingsLeadSentence(data.rows, entry, locale);

  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8">
        <article className="mx-auto max-w-5xl">
          <header className="pt-8 md:pt-12">
            <Link
              href={`${prefix}/rankings`}
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
            </div>
            <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-heading text-balance md:text-5xl">
              {t.heading}
            </h1>
            {lead && <p className="mt-4 max-w-3xl text-lg leading-relaxed">{lead}</p>}
            <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{t.scenarioNote}</p>
          </header>

          <section className="mt-10">
            {data.rows.length === 0 ? (
              <p className="rounded-xl border border-border/50 p-6 leading-7 text-muted-foreground">
                {t.emptyState}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/50">
                <table className="w-full min-w-[40rem] text-sm">
                  <caption className="sr-only">{t.tableCaption}</caption>
                  <thead>
                    <tr className="border-b border-border/50 text-left text-xs tracking-widest text-muted-foreground uppercase">
                      <th scope="col" className="px-4 py-3">
                        {t.colRank}
                      </th>
                      <th scope="col" className="px-4 py-3">
                        {t.colGpu}
                      </th>
                      <th scope="col" className="px-4 py-3">
                        {t.colThroughput}
                      </th>
                      <th scope="col" className="px-4 py-3">
                        {t.colCost}
                      </th>
                      <th scope="col" className="px-4 py-3">
                        {t.colPrecision}
                      </th>
                      <th scope="col" className="px-4 py-3">
                        {t.colEngine}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => {
                      const runEntry = row.chip
                        ? getRunPageEntry(`${entry.model.slug}-on-${row.chip.slug}`)
                        : undefined;
                      return (
                        <tr
                          key={row.hardware}
                          className="border-b border-border/30 last:border-b-0"
                        >
                          <td className="px-4 py-3 font-mono">{row.rank}</td>
                          <td className="px-4 py-3 font-medium">
                            {runEntry ? (
                              <Link
                                href={`${prefix}/run/${runEntry.slug}`}
                                className="text-brand hover:underline"
                              >
                                {row.hardwareLabel}
                              </Link>
                            ) : (
                              row.hardwareLabel
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono">
                            {row.throughputPerGpu === null
                              ? '-'
                              : fmtThroughput(row.throughputPerGpu)}
                          </td>
                          <td className="px-4 py-3 font-mono">
                            {row.costPerMtok === null ? '-' : fmtCostPerMtok(row.costPerMtok)}
                          </td>
                          <td className="px-4 py-3 uppercase">{row.precision ?? '-'}</td>
                          <td className="px-4 py-3">{row.framework ?? '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-4 text-sm text-muted-foreground">
              {t.siblingLead}{' '}
              <Link
                href={`${prefix}/rankings/${entry.kind === 'fastest-gpu' ? 'cheapest-gpu' : 'fastest-gpu'}-for-${entry.model.slug}`}
                className="font-medium text-brand hover:underline"
              >
                {t.siblingLabel}
              </Link>
            </p>
          </section>

          <section
            aria-labelledby="ranking-methodology"
            className="mt-10 border-t border-border/50 pt-10"
          >
            <h2 id="ranking-methodology" className="text-xl font-semibold tracking-tight">
              {t.methodologyHeading}
            </h2>
            {t.methodologyBody.map((paragraph) => (
              <p key={paragraph.slice(0, 32)} className="mt-3 leading-7 text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </section>

          <section aria-labelledby="ranking-faq" className="mt-10 border-t border-border/50 pt-10">
            <h2 id="ranking-faq" className="text-xl font-semibold tracking-tight">
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

          <section
            aria-labelledby="ranking-explore"
            className="mt-10 mb-16 rounded-xl border border-brand/20 bg-brand/6 p-5 md:p-6"
          >
            <h2 id="ranking-explore" className="text-xl font-semibold tracking-tight">
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
