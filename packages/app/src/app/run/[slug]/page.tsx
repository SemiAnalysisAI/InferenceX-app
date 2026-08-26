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
  latencyQuote,
  RunDetailContent,
  type RunStrings,
} from '@/components/live-seo/run-page-sections';
import { JsonLd } from '@/components/json-ld';
import { enAlternates } from '@/lib/i18n';
import { scenarioLabel } from '@/lib/rankings';
import {
  getRunPageEntry,
  runPageDescription,
  runPageFaqQuestions,
  runPageHeading,
  runPageKeywords,
  runPageTitle,
  type RunPageEntry,
} from '@/lib/run-pages';
import { getRunPageData, type RunPageData } from '@/lib/run-rankings-data.server';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

function primaryRead(data: RunPageData) {
  return data.tierLadder.find((read) => read.tier === data.primaryTier);
}

function statLedDescription(entry: RunPageEntry, data: RunPageData): string {
  const read = primaryRead(data);
  if (!data.hasData || !read?.throughputPerGpu) return runPageDescription(entry);
  const cost =
    read.costPerMtok === null
      ? ''
      : `, ${fmtCostPerMtok(read.costPerMtok)} per million tokens at hyperscaler pricing`;
  return `Measured: ${entry.model.seoName} sustains ${fmtThroughput(read.throughputPerGpu)} tokens/s per GPU on ${entry.chip.label} at ${data.primaryTier} tokens/s per user${cost}. Live data from ${data.configCount} benchmarked configs.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = getRunPageEntry(slug);
  if (!entry) return {};
  const data = await getRunPageData(entry.slug);
  const title = runPageTitle(entry);
  const description = `${data ? statLedDescription(entry, data) : runPageDescription(entry)} ${SUPPORTERS_LINE}`;
  const url = `${SITE_URL}/run/${entry.slug}`;
  return {
    title,
    description,
    keywords: runPageKeywords(entry),
    authors: [{ name: AUTHOR_NAME }],
    // Valid slugs without benchmark data render an empty state; keep those
    // out of the index (the sitemap already excludes them).
    ...(data?.hasData ? {} : { robots: { index: false, follow: true } }),
    alternates: enAlternates(`/run/${entry.slug}`),
    openGraph: { title: `${title} | ${SITE_NAME}`, description, url, type: 'article' },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
      creator: AUTHOR_HANDLE,
    },
  };
}

function buildFaq(entry: RunPageEntry, data: RunPageData): { question: string; answer: string }[] {
  const questions = runPageFaqQuestions(entry);
  const model = entry.model.seoName;
  const chip = entry.chip.label;
  const read = primaryRead(data);
  const workload = scenarioLabel(data.scenario, 'en');

  const peak =
    data.bestThroughputPerGpu === null ? 'n/a' : fmtThroughput(data.bestThroughputPerGpu);
  const throughputAnswer =
    typeof read?.throughputPerGpu === 'number'
      ? `At an interactivity target of ${data.primaryTier} tokens/s per user on ${workload}, ${chip} sustains ${fmtThroughput(read.throughputPerGpu)} tokens/s per GPU serving ${model}${read.framework ? ` with ${read.framework}` : ''}${read.precision ? ` in ${read.precision.toUpperCase()}` : ''}. Peak measured throughput across all configs is ${peak} tokens/s per GPU.`
      : `The InferenceX fleet has ${data.configCount} benchmarked configs for this pairing; see the interactivity ladder above for the operating points reached so far.`;

  const costAnswer =
    typeof read?.costPerMtok === 'number'
      ? `${fmtCostPerMtok(read.costPerMtok)} per million total tokens at hyperscaler $/GPU/hr pricing, at ${data.primaryTier} tokens/s per user. Neocloud and retail rental tiers are tabulated above; slower interactivity targets lower the cost further.`
      : `Cost per million tokens is derived from measured throughput and $/GPU/hr rates from the SemiAnalysis AI Cloud TCO model; it appears once this pairing reaches the primary interactivity tier.`;

  const servingAnswer = `The runs behind this page used ${data.frameworks.join(', ')} in ${data.precisions.map((p) => p.toUpperCase()).join(', ')}${data.hasDisagg ? ', including disaggregated prefill' : ''}${data.hasMultinode ? ' and multi-node serving' : ''}. Engines are rebuilt and re-benchmarked continuously, so the best config can change between visits.`;

  const methodologyAnswer = `Every number is measured on real ${chip} hardware by the InferenceX fleet, sweeping concurrency on ${workload} to trace the throughput-versus-interactivity frontier${data.newest ? `; the newest run landed on ${data.newest}` : ''}. The same derivation powers the InferenceX overview leaderboard.`;

  return [
    { question: questions.throughput, answer: throughputAnswer },
    { question: questions.cost, answer: costAnswer },
    { question: questions.serving, answer: servingAnswer },
    { question: questions.methodology, answer: methodologyAnswer },
  ];
}

export default async function RunPage({ params }: Props) {
  const { slug } = await params;
  const entry = getRunPageEntry(slug);
  if (!entry) notFound();
  const data = await getRunPageData(entry.slug);
  if (!data) notFound();

  const url = `${SITE_URL}/run/${entry.slug}`;
  const heading = runPageHeading(entry);
  const faq = data.hasData ? buildFaq(entry, data) : [];
  const read = primaryRead(data);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: runPageTitle(entry),
        url,
        ...(data.newest && { dateModified: data.newest }),
        ...(data.oldest && { datePublished: data.oldest }),
      },
      ...(faq.length > 0
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: faq.map((item) => ({
                '@type': 'Question',
                name: item.question,
                acceptedAnswer: { '@type': 'Answer', text: item.answer },
              })),
            },
          ]
        : []),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Run', item: `${SITE_URL}/run` },
          { '@type': 'ListItem', position: 2, name: heading, item: url },
        ],
      },
    ],
  };

  const quickAnswerCost =
    typeof read?.costPerMtok === 'number'
      ? `, which works out to ${fmtCostPerMtok(read.costPerMtok)} per million tokens at hyperscaler pricing`
      : '';
  const latency = latencyQuote(data);
  const quickAnswerLatency = latency ? ` Best measured latency: ${latency}.` : '';
  const quickAnswer =
    typeof read?.throughputPerGpu === 'number'
      ? `${entry.model.seoName} sustains ${fmtThroughput(read.throughputPerGpu)} tokens/s per GPU on ${entry.chip.label} at ${data.primaryTier} tokens/s per user${quickAnswerCost}${read.framework ? `, served by ${read.framework}` : ''}.${quickAnswerLatency}`
      : `${entry.model.seoName} runs on ${entry.chip.label}: ${data.configCount} benchmarked configs so far. See the interactivity ladder below for measured operating points.`;

  const t: RunStrings = {
    backHref: '/run',
    backLabel: 'All model and GPU pairings',
    heading,
    quickAnswerLabel: 'Quick answer',
    quickAnswer,
    statConfigs: 'Benchmarked configs',
    statEngines: 'Serving engines',
    statPrecisions: 'Precisions',
    statFreshness: 'Run dates',
    ladderHeading: 'Throughput at every interactivity target',
    ladderIntro: `Serving is a trade-off: push more concurrent users through a GPU and each user's tokens arrive slower. The ladder below reads the measured frontier at each per-user speed target on ${scenarioLabel(data.scenario, 'en')}, using the best engine and precision at that point.`,
    colTier: 'Per-user target',
    colThroughput: 'Tokens/s per GPU',
    colCost: '$ / 1M tokens',
    colEngine: 'Engine',
    colPrecision: 'Precision',
    costHeading: 'What serving actually costs',
    costIntro: `Converting the ${data.primaryTier} tokens/s per user operating point to $ per million total tokens across rental pricing tiers from the SemiAnalysis AI Cloud TCO model.`,
    colPriceTier: 'Pricing tier',
    colGpuHour: '$ / GPU / hr',
    colCostPerMtok: '$ / 1M tokens',
    priceTierLabels: {
      hyperscaler: 'Hyperscaler',
      neocloud: 'Neocloud',
      retail: 'Retail',
    },
    emptyState: `The InferenceX fleet has not published benchmark runs for ${entry.model.seoName} on ${entry.chip.label} yet. Benchmarks re-run continuously; this page fills in automatically as soon as results land.`,
    faqHeading: 'Frequently asked questions',
    faq,
    exploreHeading: 'Explore the data',
    exploreLinks: [
      {
        href: `/rankings/fastest-gpu-for-${entry.model.slug}`,
        label: `Fastest GPU for ${entry.model.seoName}: full ranking`,
      },
      {
        href: `/rankings/cheapest-gpu-for-${entry.model.slug}`,
        label: `Cheapest GPU for ${entry.model.seoName}: full ranking`,
      },
      {
        href: `/model/${entry.model.slug}`,
        label: `${entry.model.seoName} deep dive: architecture, evals, and performance`,
      },
      { href: `/chips/${entry.chip.slug}`, label: `${entry.chip.title} specs and pricing` },
      { href: '/inference', label: 'Interactive inference dashboard' },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <RunDetailContent entry={entry} data={data} t={t} />
    </>
  );
}
