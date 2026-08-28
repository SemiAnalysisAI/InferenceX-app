import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  AUTHOR_HANDLE,
  AUTHOR_NAME,
  SITE_NAME,
  SITE_URL,
  SUPPORTERS_LINE,
} from '@semianalysisai/inferencex-constants';

import { fmtCostPerMtok, fmtThroughput } from '@/components/live-seo/format';
import {
  RankingsDetailContent,
  type RankingsStrings,
} from '@/components/live-seo/rankings-page-sections';
import { JsonLd } from '@/components/json-ld';
import { enAlternates } from '@/lib/i18n';
import {
  getRankingPageEntry,
  rankingPageDescription,
  rankingPageHeading,
  rankingPageKeywords,
  rankingPageTitle,
  scenarioLabel,
  type RankingPageEntry,
} from '@/lib/rankings';
import { getRankingPageData, type RankingPageData } from '@/lib/run-rankings-data.server';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

function statLedDescription(entry: RankingPageEntry, data: RankingPageData): string {
  const [first] = data.rows;
  if (!first) return rankingPageDescription(entry);
  if (entry.kind === 'fastest-gpu' && first.throughputPerGpu !== null) {
    return `${first.hardwareLabel} currently serves ${entry.model.seoName} fastest at ${fmtThroughput(first.throughputPerGpu)} tokens/s per GPU. Live ranking of ${data.rows.length} platforms, re-benchmarked continuously.`;
  }
  if (entry.kind === 'cheapest-gpu' && first.costPerMtok !== null) {
    return `${first.hardwareLabel} currently serves ${entry.model.seoName} cheapest at ${fmtCostPerMtok(first.costPerMtok)} per million tokens. Live ranking of ${data.rows.length} platforms, re-benchmarked continuously.`;
  }
  return rankingPageDescription(entry);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = getRankingPageEntry(slug);
  if (!entry) return {};
  const data = await getRankingPageData(entry.slug);
  const title = rankingPageTitle(entry);
  const description = `${data ? statLedDescription(entry, data) : rankingPageDescription(entry)} ${SUPPORTERS_LINE}`;
  const url = `${SITE_URL}/rankings/${entry.slug}`;
  return {
    title,
    description,
    keywords: rankingPageKeywords(entry),
    authors: [{ name: AUTHOR_NAME }],
    alternates: enAlternates(`/rankings/${entry.slug}`),
    openGraph: { title: `${title} | ${SITE_NAME}`, description, url, type: 'article' },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
      creator: AUTHOR_HANDLE,
    },
  };
}

function buildFaq(
  entry: RankingPageEntry,
  data: RankingPageData,
): { question: string; answer: string }[] {
  const model = entry.model.seoName;
  const [first] = data.rows;
  const workload = scenarioLabel(data.scenario, 'en');
  const fallbackLeader = `The ranking is refreshed continuously from InferenceX benchmark runs; check the table above for the current leader.`;
  const kindFaq =
    entry.kind === 'fastest-gpu'
      ? [
          {
            question: `What is the fastest GPU for ${model} inference?`,
            answer:
              first && typeof first.throughputPerGpu === 'number'
                ? `As of the latest benchmark runs, ${first.hardwareLabel} leads at ${fmtThroughput(first.throughputPerGpu)} tokens/s per GPU on ${workload}, measured at a matched interactivity target of ${data.tier} tokens/s per user.`
                : fallbackLeader,
          },
          {
            question: `How is "fastest" measured?`,
            answer: `Every platform is read at the same interactivity tier (${data.tier} tokens/s per user) on ${workload}, then ranked by measured throughput per GPU. This is the same derivation the InferenceX overview leaderboard renders, so the ranking can never disagree with the dashboard.`,
          },
        ]
      : [
          {
            question: `What is the cheapest GPU to run ${model}?`,
            answer:
              first && typeof first.costPerMtok === 'number'
                ? `As of the latest benchmark runs, ${first.hardwareLabel} is cheapest at ${fmtCostPerMtok(first.costPerMtok)} per million total tokens on ${workload}, at hyperscaler $/GPU/hr pricing and a matched interactivity target of ${data.tier} tokens/s per user.`
                : fallbackLeader,
          },
          {
            question: `How is cost per million tokens calculated?`,
            answer: `Measured throughput per GPU at the ${data.tier} tokens/s per user tier is converted to $ per million total (input plus output) tokens using hyperscaler $/GPU/hr rates from the SemiAnalysis AI Cloud TCO model. Slower interactivity targets or cheaper rental tiers change the absolute numbers but rarely the order.`,
          },
        ];
  return [
    ...kindFaq,
    {
      question: `How often is this ranking updated?`,
      answer: data.newest
        ? `Benchmarks re-run continuously on the InferenceX cluster fleet; the newest result feeding this ranking landed on ${data.newest}. The page always renders the latest data.`
        : `Benchmarks re-run continuously on the InferenceX cluster fleet, and the page always renders the latest data.`,
    },
  ];
}

export default async function RankingPage({ params }: Props) {
  const { slug } = await params;
  const entry = getRankingPageEntry(slug);
  if (!entry) notFound();
  const data = await getRankingPageData(entry.slug);
  if (!data) notFound();

  const url = `${SITE_URL}/rankings/${entry.slug}`;
  const heading = rankingPageHeading(entry);
  const faq = buildFaq(entry, data);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: rankingPageTitle(entry),
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        numberOfItems: data.rows.length,
        itemListElement: data.rows.map((row) => ({
          '@type': 'ListItem',
          position: row.rank,
          name: row.hardwareLabel,
          ...(row.chip && { url: `${SITE_URL}/chips/${row.chip.slug}` }),
        })),
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Rankings', item: `${SITE_URL}/rankings` },
          { '@type': 'ListItem', position: 2, name: heading, item: url },
        ],
      },
    ],
  };

  const t: RankingsStrings = {
    backLabel: 'GPU rankings',
    heading,
    scenarioNote: `Measured on ${scenarioLabel(data.scenario, 'en')} at a matched interactivity target of ${data.tier} tokens/s per user. Hardware without a measurement at this operating point is not ranked.`,
    tableCaption: `${heading}: live benchmark ranking`,
    colRank: 'Rank',
    colGpu: 'GPU',
    colThroughput: 'Tokens/s per GPU',
    colCost: '$ / 1M tokens',
    colPrecision: 'Precision',
    colEngine: 'Engine',
    emptyState: `No benchmark measurements are available for ${entry.model.seoName} at this operating point yet. The InferenceX fleet re-benchmarks continuously; this page fills in automatically as soon as runs land.`,
    siblingLead:
      entry.kind === 'fastest-gpu'
        ? 'Optimizing for cost instead of speed?'
        : 'Optimizing for speed instead of cost?',
    siblingLabel:
      entry.kind === 'fastest-gpu'
        ? `See the cheapest GPU for ${entry.model.seoName}`
        : `See the fastest GPU for ${entry.model.seoName}`,
    methodologyHeading: 'Methodology',
    methodologyBody: [
      `Every number on this page is a measurement, not a spec-sheet estimate. The InferenceX fleet serves ${entry.model.seoName} on real hardware with community serving engines, sweeping concurrency to trace each platform's throughput-versus-interactivity frontier.`,
      `Platforms are then read at the same operating point (${data.tier} tokens/s per user) so the comparison is iso-interactivity: a GPU cannot win by quoting throughput at an unusably slow per-user speed. Cost converts measured throughput to $ per million total tokens using $/GPU/hr rates from the SemiAnalysis AI Cloud TCO model.`,
      `The derivation is shared with the InferenceX overview leaderboard, and results re-run continuously, so this ranking updates as new engine releases and configs land.`,
    ],
    faqHeading: 'Frequently asked questions',
    faq,
    exploreHeading: 'Explore the data',
    exploreLinks: [
      {
        href: `/model/${entry.model.slug}`,
        label: `${entry.model.seoName} deep dive: architecture, evals, and performance`,
      },
      { href: '/inference', label: 'Interactive inference dashboard' },
      { href: '/overview', label: 'Cross-model inference leaderboard' },
      { href: '/compare', label: 'Head-to-head GPU comparisons' },
      { href: '/chips', label: 'GPU specs and pricing' },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <RankingsDetailContent entry={entry} data={data} t={t} locale="en" />
    </>
  );
}
