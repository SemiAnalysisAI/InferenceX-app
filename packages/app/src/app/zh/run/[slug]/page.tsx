import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  AUTHOR_NAME,
  SITE_NAME,
  SITE_URL,
  SUPPORTERS_LINE_ZH,
} from '@semianalysisai/inferencex-constants';

import { fmtCostPerMtok, fmtThroughput } from '@/components/live-seo/format';
import {
  latencyQuote,
  RunDetailContent,
  type RunStrings,
} from '@/components/live-seo/run-page-sections';
import { JsonLd } from '@/components/json-ld';
import { ZH_LANG_TAG, ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import { scenarioLabel } from '@/lib/rankings';
import { getRunPageEntry, type RunPageEntry } from '@/lib/run-pages';
import {
  runPageDescriptionZh,
  runPageFaqQuestionsZh,
  runPageHeadingZh,
  runPageTitleZh,
  runPageKeywordsZh,
} from '@/lib/run-pages-zh';
import { getRunPageData, type RunPageData } from '@/lib/run-rankings-data.server';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

function primaryRead(data: RunPageData) {
  return data.tierLadder.find((read) => read.tier === data.primaryTier);
}

function statLedDescriptionZh(entry: RunPageEntry, data: RunPageData): string {
  const read = primaryRead(data);
  if (!data.hasData || !read?.throughputPerGpu) return runPageDescriptionZh(entry);
  const cost =
    read.costPerMtok === null
      ? ''
      : `，按超大规模云价格每百万 token 成本 ${fmtCostPerMtok(read.costPerMtok)}`;
  const chipLabel = entry.chip.label;
  return `实测数据：运行 ${entry.model.seoName} 时，${chipLabel} 在每用户每秒 ${data.primaryTier} token 的交互速度下，单 GPU 总吞吐量（输入加输出）可持续达到 ${fmtThroughput(read.throughputPerGpu)} token/s${cost}。共 ${data.configCount} 组实测配置，数据持续更新。`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = getRunPageEntry(slug);
  if (!entry) return {};
  const data = await getRunPageData(entry.slug);
  const title = runPageTitleZh(entry);
  const description = `${data ? statLedDescriptionZh(entry, data) : runPageDescriptionZh(entry)}${SUPPORTERS_LINE_ZH}`;
  const url = `${SITE_URL}/zh/run/${entry.slug}`;
  return {
    title: { absolute: `${title} | ${SITE_NAME}` },
    description,
    keywords: runPageKeywordsZh(entry),
    authors: [{ name: AUTHOR_NAME }],
    // Valid slugs without benchmark data render an empty state; keep those
    // out of the index (the sitemap already excludes them).
    ...(data?.hasData ? {} : { robots: { index: false, follow: true } }),
    alternates: zhAlternates(`/run/${entry.slug}`),
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      locale: ZH_OG_LOCALE,
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title: `${title} | ${SITE_NAME}`, description },
  };
}

function buildFaqZh(
  entry: RunPageEntry,
  data: RunPageData,
): { question: string; answer: string }[] {
  const questions = runPageFaqQuestionsZh(entry);
  const model = entry.model.seoName;
  const chipLabel = entry.chip.label;
  const read = primaryRead(data);
  const workload = scenarioLabel(data.scenario, 'zh');

  const peak =
    data.bestThroughputPerGpu === null ? '暂无' : fmtThroughput(data.bestThroughputPerGpu);
  const throughputAnswer =
    typeof read?.throughputPerGpu === 'number'
      ? `在${workload}下运行 ${model}，目标交互速度为每用户每秒 ${data.primaryTier} token 时，${chipLabel} 的单 GPU 总吞吐量（输入加输出）可持续达到 ${fmtThroughput(read.throughputPerGpu)} token/s${read.framework ? `，推理引擎为 ${read.framework}` : ''}${read.precision ? `，精度为 ${read.precision.toUpperCase()}` : ''}。全部配置中的实测峰值总吞吐量为单 GPU ${peak} token/s。`
      : `InferenceX 集群已为该组合完成 ${data.configCount} 组实测配置，各交互档位的实测结果见上方阶梯表。`;

  const costAnswer =
    typeof read?.costPerMtok === 'number'
      ? `按超大规模云 $/GPU/小时 价格、每用户每秒 ${data.primaryTier} token 档位计算，每百万 token（输入加输出）成本为 ${fmtCostPerMtok(read.costPerMtok)}。新兴云与零售租用价格见上方表格；更慢的交互档位成本更低。`
      : `每百万 token 成本由实测吞吐和 SemiAnalysis AI Cloud TCO 模型的 $/GPU/小时 价格换算得出，待该组合达到主交互档位后即会显示。`;

  const servingAnswer = `本页数据来自 ${data.frameworks.join('、')}，精度覆盖 ${data.precisions.map((p) => p.toUpperCase()).join('、')}${data.hasDisagg ? '，包含 prefill 分离部署' : ''}${data.hasMultinode ? '，并包含多节点部署' : ''}。推理引擎持续重新构建并重跑基准，最优配置可能随时变化。`;

  const methodologyAnswer = `所有数字均由 InferenceX 集群在真实 ${chipLabel} 硬件上实测，通过在${workload}下扫描并发数绘制吞吐与交互速度前沿曲线${data.newest ? `；最新一次运行落在 ${data.newest}` : ''}。推导方式与 InferenceX 总览排行榜完全一致。`;

  return [
    { question: questions.throughput, answer: throughputAnswer },
    { question: questions.cost, answer: costAnswer },
    { question: questions.serving, answer: servingAnswer },
    { question: questions.methodology, answer: methodologyAnswer },
  ];
}

export default async function ZhRunPage({ params }: Props) {
  const { slug } = await params;
  const entry = getRunPageEntry(slug);
  if (!entry) notFound();
  const data = await getRunPageData(entry.slug);
  if (!data) notFound();

  const url = `${SITE_URL}/zh/run/${entry.slug}`;
  const heading = runPageHeadingZh(entry);
  const faq = data.hasData ? buildFaqZh(entry, data) : [];
  const read = primaryRead(data);
  const model = entry.model.seoName;
  const chipLabel = entry.chip.label;
  const chipTitle = entry.chip.title;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: runPageTitleZh(entry),
        url,
        inLanguage: ZH_LANG_TAG,
        ...(data.newest && { dateModified: data.newest }),
        ...(data.oldest && { datePublished: data.oldest }),
      },
      ...(faq.length > 0
        ? [
            {
              '@type': 'FAQPage',
              inLanguage: ZH_LANG_TAG,
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
          { '@type': 'ListItem', position: 1, name: '模型与 GPU 组合', item: `${SITE_URL}/zh/run` },
          { '@type': 'ListItem', position: 2, name: heading, item: url },
        ],
      },
    ],
  };

  const quickAnswerCost =
    typeof read?.costPerMtok === 'number'
      ? `，按超大规模云价格折合每百万 token ${fmtCostPerMtok(read.costPerMtok)}`
      : '';
  const latency = latencyQuote(data);
  const quickAnswerLatency = latency
    ? `全部实测配置中最快 TTFT 为 ${latency.ttft}，最快 TPOT 为 ${latency.tpot}（两者各自取最优，可能来自不同配置）。`
    : '';
  const quickAnswer =
    typeof read?.throughputPerGpu === 'number'
      ? `运行 ${model} 时，${chipLabel} 在每用户每秒 ${data.primaryTier} token 的交互速度下，单 GPU 总吞吐量（输入加输出）可持续达到 ${fmtThroughput(read.throughputPerGpu)} token/s${quickAnswerCost}${read.framework ? `，推理引擎为 ${read.framework}` : ''}。${quickAnswerLatency}`
      : `${model} 可在 ${chipLabel} 上运行：目前已有 ${data.configCount} 组实测配置，各档位实测结果见下方阶梯表。`;

  const t: RunStrings = {
    backHref: '/zh/run',
    backLabel: '全部模型与 GPU 组合',
    heading,
    quickAnswerLabel: '快速结论',
    quickAnswer,
    statConfigs: '实测配置数',
    statEngines: '推理引擎',
    statPrecisions: '精度',
    statFreshness: '运行日期',
    ladderHeading: '各交互档位下的吞吐表现',
    ladderIntro: `推理部署是一种权衡：单 GPU 上并发用户越多，每个用户收到 token 的速度就越慢。下表在${scenarioLabel(data.scenario, 'zh')}下按每个单用户速度目标读取实测前沿，取该工作点上最优的引擎与精度。`,
    colTier: '单用户速度目标',
    colThroughput: '单 GPU 每秒 token 数',
    colCost: '每百万 token 成本',
    colEngine: '推理引擎',
    colPrecision: '精度',
    costHeading: '实际部署成本',
    costIntro: `将每用户每秒 ${data.primaryTier} token 工作点的实测吞吐，按 SemiAnalysis AI Cloud TCO 模型的各档租用价格换算为每百万 token（输入加输出）成本。`,
    colPriceTier: '价格档位',
    colGpuHour: '$/GPU/小时',
    colCostPerMtok: '每百万 token 成本',
    priceTierLabels: {
      hyperscaler: '超大规模云',
      neocloud: '新兴云',
      retail: '零售租用',
    },
    emptyState: `InferenceX 集群尚未发布 ${model} 在 ${chipLabel} 上的基准测试结果。基准测试持续运行，新结果落地后本页会自动填充。`,
    faqHeading: '常见问题',
    faq,
    exploreHeading: '继续探索数据',
    exploreLinks: [
      {
        href: `/zh/rankings/fastest-gpu-for-${entry.model.slug}`,
        label: `${entry.model.seoName} 推理最快 GPU 完整排行`,
      },
      {
        href: `/zh/rankings/cheapest-gpu-for-${entry.model.slug}`,
        label: `运行 ${entry.model.seoName} 最省钱 GPU 完整排行`,
      },
      {
        href: `/zh/model/${entry.model.slug}`,
        label: `${entry.model.seoName} 详解：架构、评估与性能`,
      },
      { href: `/zh/chips/${entry.chip.slug}`, label: `${chipTitle} 规格与价格` },
      { href: '/zh/inference', label: '交互式推理仪表盘' },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <RunDetailContent entry={entry} data={data} t={t} />
    </>
  );
}
