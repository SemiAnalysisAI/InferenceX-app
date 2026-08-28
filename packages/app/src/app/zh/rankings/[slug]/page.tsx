import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { fmtCostPerMtok, fmtThroughput } from '@/components/live-seo/format';
import {
  RankingsDetailContent,
  type RankingsStrings,
} from '@/components/live-seo/rankings-page-sections';
import { JsonLd } from '@/components/json-ld';
import { ZH_LANG_TAG, ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import { getRankingPageEntry, scenarioLabel, type RankingPageEntry } from '@/lib/rankings';
import {
  rankingPageDescriptionZh,
  rankingPageHeadingZh,
  rankingPageKeywordsZh,
  rankingPageTitleZh,
} from '@/lib/rankings-zh';
import { getRankingPageData, type RankingPageData } from '@/lib/run-rankings-data.server';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

function statLedDescriptionZh(entry: RankingPageEntry, data: RankingPageData): string {
  const [first] = data.rows;
  if (!first) return rankingPageDescriptionZh(entry);
  if (entry.kind === 'fastest-gpu' && first.throughputPerGpu !== null) {
    return `${first.hardwareLabel} 目前以单 GPU 每秒 ${fmtThroughput(first.throughputPerGpu)} token 领跑 ${entry.model.seoName} 推理。共 ${data.rows.length} 个平台实时排名，数据持续更新。`;
  }
  if (entry.kind === 'cheapest-gpu' && first.costPerMtok !== null) {
    return `${first.hardwareLabel} 目前以每百万 token ${fmtCostPerMtok(first.costPerMtok)} 的成本领跑 ${entry.model.seoName} 推理。共 ${data.rows.length} 个平台实时排名，数据持续更新。`;
  }
  return rankingPageDescriptionZh(entry);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = getRankingPageEntry(slug);
  if (!entry) return {};
  const data = await getRankingPageData(entry.slug);
  const title = rankingPageTitleZh(entry);
  const description = data ? statLedDescriptionZh(entry, data) : rankingPageDescriptionZh(entry);
  const url = `${SITE_URL}/zh/rankings/${entry.slug}`;
  return {
    title: { absolute: `${title} | ${SITE_NAME}` },
    description,
    keywords: rankingPageKeywordsZh(entry),
    authors: [{ name: AUTHOR_NAME }],
    alternates: zhAlternates(`/rankings/${entry.slug}`),
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
  entry: RankingPageEntry,
  data: RankingPageData,
): { question: string; answer: string }[] {
  const model = entry.model.seoName;
  const [first] = data.rows;
  const workload = scenarioLabel(data.scenario, 'zh');
  const fallbackLeader = `排行数据来自 InferenceX 持续运行的基准测试，最新领先者见上方表格。`;
  const kindFaq =
    entry.kind === 'fastest-gpu'
      ? [
          {
            question: `${model} 推理最快的 GPU 是哪款？`,
            answer:
              first && typeof first.throughputPerGpu === 'number'
                ? `按最新基准测试结果，${first.hardwareLabel} 在${workload}下以单 GPU 每秒 ${fmtThroughput(first.throughputPerGpu)} token 领先，交互速度统一设定为每用户每秒 ${data.tier} token。`
                : fallbackLeader,
          },
          {
            question: `“最快”是如何衡量的？`,
            answer: `所有平台都在相同的交互速度档位（每用户每秒 ${data.tier} token）和${workload}下读取，再按实测单 GPU 吞吐排名。推导方式与 InferenceX 总览排行榜完全一致，因此本页排名不会与仪表盘出现分歧。`,
          },
        ]
      : [
          {
            question: `运行 ${model} 最省钱的 GPU 是哪款？`,
            answer:
              first && typeof first.costPerMtok === 'number'
                ? `按最新基准测试结果，${first.hardwareLabel} 在${workload}下成本最低，每百万 token（输入加输出）仅 ${fmtCostPerMtok(first.costPerMtok)}，按超大规模云 $/GPU/小时 价格计算，交互速度统一设定为每用户每秒 ${data.tier} token。`
                : fallbackLeader,
          },
          {
            question: `每百万 token 成本是如何计算的？`,
            answer: `将每用户每秒 ${data.tier} token 档位下的实测单 GPU 吞吐，按 SemiAnalysis AI Cloud TCO 模型中的超大规模云 $/GPU/小时 价格换算为每百万 token（输入加输出）成本。更慢的交互档位或更便宜的租用价格会改变绝对数值，但很少改变排名顺序。`,
          },
        ];
  return [
    ...kindFaq,
    {
      question: `排行多久更新一次？`,
      answer: data.newest
        ? `基准测试在 InferenceX 集群上持续运行，本排行最新一条结果落在 ${data.newest}。页面始终渲染最新数据。`
        : `基准测试在 InferenceX 集群上持续运行，页面始终渲染最新数据。`,
    },
  ];
}

export default async function ZhRankingPage({ params }: Props) {
  const { slug } = await params;
  const entry = getRankingPageEntry(slug);
  if (!entry) notFound();
  const data = await getRankingPageData(entry.slug);
  if (!data) notFound();

  const url = `${SITE_URL}/zh/rankings/${entry.slug}`;
  const heading = rankingPageHeadingZh(entry);
  const faq = buildFaqZh(entry, data);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: rankingPageTitleZh(entry),
        inLanguage: ZH_LANG_TAG,
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        numberOfItems: data.rows.length,
        itemListElement: data.rows.map((row) => ({
          '@type': 'ListItem',
          position: row.rank,
          name: row.hardwareLabel,
          ...(row.chip && { url: `${SITE_URL}/zh/chips/${row.chip.slug}` }),
        })),
      },
      {
        '@type': 'FAQPage',
        inLanguage: ZH_LANG_TAG,
        mainEntity: faq.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'GPU 排行榜',
            item: `${SITE_URL}/zh/rankings`,
          },
          { '@type': 'ListItem', position: 2, name: heading, item: url },
        ],
      },
    ],
  };

  const t: RankingsStrings = {
    backLabel: 'GPU 排行榜',
    heading,
    scenarioNote: `测试基于${scenarioLabel(data.scenario, 'zh')}，交互速度统一设定为每用户每秒 ${data.tier} token。在该工作点没有实测数据的硬件不参与排名。`,
    tableCaption: `${heading}：实时基准排行`,
    colRank: '排名',
    colGpu: 'GPU',
    colThroughput: '单 GPU 每秒 token 数',
    colCost: '每百万 token 成本',
    colPrecision: '精度',
    colEngine: '推理引擎',
    emptyState: `${entry.model.seoName} 在该工作点暂无实测数据。InferenceX 集群持续运行基准测试，新结果落地后本页会自动填充。`,
    siblingLead: entry.kind === 'fastest-gpu' ? '更关注成本而不是速度？' : '更关注速度而不是成本？',
    siblingLabel:
      entry.kind === 'fastest-gpu'
        ? `查看运行 ${entry.model.seoName} 最省钱的 GPU`
        : `查看 ${entry.model.seoName} 推理最快的 GPU`,
    methodologyHeading: '测试方法',
    methodologyBody: [
      `本页所有数字都来自实测，而非纸面规格估算。InferenceX 集群使用社区推理引擎在真实硬件上部署 ${entry.model.seoName}，通过扫描并发数绘制每个平台的吞吐与交互速度前沿曲线。`,
      `所有平台在同一工作点（每用户每秒 ${data.tier} token）读取，保证对比是等交互速度的：任何 GPU 都无法靠牺牲单用户速度换取纸面吞吐来取胜。成本按 SemiAnalysis AI Cloud TCO 模型的 $/GPU/小时 价格，把实测吞吐换算为每百万 token（输入加输出）成本。`,
      `推导逻辑与 InferenceX 总览排行榜共用，基准测试持续重跑，新引擎版本和新配置落地后排行会自动更新。`,
    ],
    faqHeading: '常见问题',
    faq,
    exploreHeading: '继续探索数据',
    exploreLinks: [
      { href: '/zh/inference', label: '交互式推理仪表盘' },
      { href: '/zh/overview', label: '跨模型推理排行榜' },
      { href: '/zh/compare', label: 'GPU 一对一对比' },
      { href: '/zh/chips', label: 'GPU 规格与价格' },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <RankingsDetailContent entry={entry} data={data} t={t} locale="zh" />
    </>
  );
}
