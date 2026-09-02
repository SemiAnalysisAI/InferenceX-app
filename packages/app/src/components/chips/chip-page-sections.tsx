/**
 * Server-rendered sections shared by the /chips and /zh/chips pages.
 *
 * Locale is passed as a prop per AGENTS.md rule 5 (server components take an
 * optional `locale`); all prose comes from `chip-pages.ts` (en) and
 * `chip-pages-zh.ts` (zh), and every number is derived from GPU_SPECS and
 * HW_REGISTRY so the pages can never drift from the dashboard.
 */
import Link from 'next/link';

import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { CatalogLinkCard } from '@/components/catalog/catalog-link-card';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { getPostBySlug } from '@/lib/blog';
import {
  CHIP_VS_HIGHLIGHT_LABELS_EN,
  buildChipFaq,
  buildChipVsFaq,
  buildChipVsHighlights,
  type ChipFaqItem,
  type ChipPageEntry,
  type ChipVsPage,
  getAllChipPages,
  getAllChipVsPages,
  getChipHw,
  getChipSpec,
} from '@/lib/chip-pages';
import {
  CHIP_VS_HIGHLIGHT_LABELS_ZH,
  buildZhChipFaq,
  buildZhChipVsFaq,
  getZhChipTranslation,
  localizeVsHighlightValueZh,
} from '@/lib/chip-pages-zh';
import { getGlossaryEntry } from '@/lib/glossary';
import { getZhGlossaryEntry } from '@/lib/glossary-zh';
import { type Locale, localePath, ZH_LANG_TAG } from '@/lib/i18n';
import {
  ACCELERATOR_MODEL_TITLE,
  ACCELERATOR_MODEL_URL,
  SITE_URL,
  TCO_MODEL_TITLE,
  TCO_SOURCE_URL,
} from '@semianalysisai/inferencex-constants';

const STRINGS = {
  en: {
    breadcrumbRoot: 'AI Chips',
    backToIndex: 'All AI inference chips',
    indexTitle: 'AI Chips for LLM Inference',
    indexIntro:
      'Specs, cloud pricing and continuously measured inference benchmarks for every chip InferenceX covers. Each page joins the hardware data used by the live dashboard with the SemiAnalysis AI Cloud TCO rates.',
    chipPages: 'Chip pages',
    vsPages: 'Head-to-head comparisons',
    specsHeading: 'Specifications',
    pricingHeading: 'Power & cloud pricing',
    faqHeading: 'Frequently asked questions',
    relatedArticles: 'Benchmark analyses',
    relatedTerms: 'Glossary',
    relatedChips: 'Related chips',
    liveCta: 'See live benchmark results',
    liveCtaBody:
      'Every number above is static hardware data. Delivered tokens per second, cost per million tokens and energy per token are measured continuously on the dashboard:',
    liveLinkInference: 'Live inference dashboard',
    liveLinkCompare: 'Chip-vs-chip model comparisons',
    liveLinkPerDollar: 'Performance per dollar',
    liveLinkOverview: 'Benchmark methodology & overview',
    modelsHeading: 'Go deeper with the SemiAnalysis models',
    modelsBody:
      'InferenceX measures delivered inference performance. The SemiAnalysis institutional models cover the market behind these chips: who ships them, who buys them, and what they cost to own.',
    modelsAccDesc:
      'SKU-level AI accelerator shipments, pricing and specifications, from foundry wafer starts and HBM supply through customer-level installed base, quarterly with multi-year forecasts.',
    modelsTcoDesc:
      'The source of the hourly rates on this page: all-in GPU cost of ownership built up from server capex, power, colocation and cost of capital, with rental price scenarios and a full cluster finance suite.',
    pricingSource: 'Source: $/chip/hr rate tiers from the SemiAnalysis',
    specLabels: {
      vendor: 'Vendor',
      arch: 'Architecture',
      memory: 'Memory (usable)',
      memoryBandwidth: 'Memory bandwidth',
      fp4: 'FP4 dense TFLOP/s',
      fp8: 'FP8 dense TFLOP/s',
      bf16: 'BF16 dense TFLOP/s',
      scaleUp: 'Scale-up interconnect',
      scaleUpBandwidth: 'Scale-up bandwidth per chip',
      worldSize: 'Scale-up world size',
      scaleUpTopology: 'Scale-up topology',
      scaleOut: 'Scale-out network',
      nic: 'NIC',
      tdp: 'TDP per chip',
      allInPower: 'All-in power per chip',
      costHyperscaler: 'Hyperscaler $/chip/hr',
      costNeocloud: 'Neocloud $/chip/hr',
      costRetail: 'Retail $/chip/hr',
    },
    notSupported: 'Not supported',
    none: 'N/A (NVLink domain only)',
    vsRatioNote: 'Ratios are spec-sheet values; see the live compare pages for measured deltas.',
    vsRatioNa: 'n/a',
    vsSpecTableCaption: 'Spec-sheet comparison',
    specScrollHint: 'Swipe horizontally to view all specification values.',
    overviewHeading: 'Overview',
    benchmarkHeading: 'How InferenceX benchmarks it',
    vsIntroPrefix: 'Spec-sheet and pricing comparison of',
    vsIntroAnd: 'and',
    vsIntroSuffix:
      'with links to continuously measured LLM inference benchmarks on identical workloads.',
  },
  zh: {
    breadcrumbRoot: 'AI 芯片',
    backToIndex: '全部 AI 推理芯片',
    indexTitle: '面向 LLM 推理的 AI 芯片',
    indexIntro:
      'InferenceX 覆盖的每一款芯片的规格、云端价格与持续测量的推理基准测试。每个页面都将实时仪表板使用的硬件数据与 SemiAnalysis AI Cloud TCO 费率相结合。',
    chipPages: '芯片页面',
    vsPages: '芯片对比',
    specsHeading: '规格参数',
    pricingHeading: '功耗与云端价格',
    faqHeading: '常见问题',
    relatedArticles: '基准测试分析',
    relatedTerms: '术语表',
    relatedChips: '相关芯片',
    liveCta: '查看实时基准测试结果',
    liveCtaBody:
      '以上都是静态硬件数据。实际交付的 token 吞吐量、每百万 token 成本和每 token 能耗在仪表板上持续测量：',
    liveLinkInference: '实时推理仪表板',
    liveLinkCompare: '芯片对芯片模型对比',
    liveLinkPerDollar: '每美元性能',
    liveLinkOverview: '基准测试方法与总览',
    modelsHeading: '通过 SemiAnalysis 行业模型深入研究',
    modelsBody:
      'InferenceX 测量实际交付的推理性能，而 SemiAnalysis 机构级行业模型覆盖这些芯片背后的市场：谁在出货、谁在采购、拥有成本是多少。',
    modelsAccDesc:
      '按 SKU 跟踪 AI 加速器的出货量、价格与规格，覆盖从晶圆代工投片、HBM 供应到客户级装机量的完整链路，按季度更新并包含多年预测。',
    modelsTcoDesc:
      '本页每小时费率的数据来源：从服务器资本开支、电力、托管与资金成本自下而上构建 GPU 全含拥有成本，并提供租赁价格情景与完整的集群财务模型。',
    pricingSource: '来源：$/芯片/小时 费率取自 SemiAnalysis',
    specLabels: {
      vendor: '厂商',
      arch: '架构',
      memory: '显存（可用）',
      memoryBandwidth: '内存带宽',
      fp4: 'FP4 稠密 TFLOP/s',
      fp8: 'FP8 稠密 TFLOP/s',
      bf16: 'BF16 稠密 TFLOP/s',
      scaleUp: 'Scale-up 互联',
      scaleUpBandwidth: '单芯片 scale-up 带宽',
      worldSize: 'Scale-up 域规模',
      scaleUpTopology: 'Scale-up 拓扑',
      scaleOut: 'Scale-out 网络',
      nic: '网卡',
      tdp: '单芯片 TDP',
      allInPower: '单芯片整机功耗',
      costHyperscaler: '超大规模云 $/芯片/小时',
      costNeocloud: 'Neocloud $/芯片/小时',
      costRetail: '零售档 $/芯片/小时',
    },
    notSupported: '不支持',
    none: '无（仅 NVLink 域内互联）',
    vsRatioNote: '倍数为纸面规格对比；实测差距请见实时对比页面。',
    vsRatioNa: '不适用',
    vsSpecTableCaption: '纸面规格对比',
    specScrollHint: '左右滑动可查看全部规格参数。',
    overviewHeading: '概览',
    benchmarkHeading: 'InferenceX 如何测试这款芯片',
    vsIntroPrefix: '本页对比',
    vsIntroAnd: '与',
    vsIntroSuffix: '的纸面规格与价格，并链接到相同工作负载上持续测量的 LLM 推理基准测试。',
  },
} as const;

function chipFaq(entry: ChipPageEntry, locale: Locale): readonly ChipFaqItem[] {
  return locale === 'zh' ? buildZhChipFaq(entry) : buildChipFaq(entry);
}

function vsFaq(page: ChipVsPage, locale: Locale): readonly ChipFaqItem[] {
  return locale === 'zh' ? buildZhChipVsFaq(page) : buildChipVsFaq(page);
}

function faqJsonLd(faq: readonly ChipFaqItem[], url: string, locale: Locale) {
  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    ...(locale === 'zh' ? { inLanguage: ZH_LANG_TAG } : {}),
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

function breadcrumbJsonLd(locale: Locale, leafName: string, leafPath: string) {
  const t = STRINGS[locale];
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: t.breadcrumbRoot,
        item: `${SITE_URL}${localePath('/chips', locale)}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: leafName,
        item: `${SITE_URL}${localePath(leafPath, locale)}`,
      },
    ],
  };
}

const FaqSection = ({ faq, locale }: { faq: readonly ChipFaqItem[]; locale: Locale }) => (
  <section aria-labelledby="chip-faq" className="mt-10 border-t border-border/50 pt-10">
    <h2 id="chip-faq" className="text-xl font-semibold tracking-tight">
      {STRINGS[locale].faqHeading}
    </h2>
    <dl className="mt-4 space-y-6">
      {faq.map((item) => (
        <div key={item.question}>
          <dt className="font-medium">{item.question}</dt>
          <dd className="mt-2 leading-7 text-muted-foreground">{item.answer}</dd>
        </div>
      ))}
    </dl>
  </section>
);

const LiveResultsSection = ({ locale }: { locale: Locale }) => {
  const t = STRINGS[locale];
  const links = [
    { href: localePath('/', locale), label: t.liveLinkInference },
    { href: localePath('/compare', locale), label: t.liveLinkCompare },
    { href: localePath('/compare-per-dollar', locale), label: t.liveLinkPerDollar },
    { href: localePath('/overview', locale), label: t.liveLinkOverview },
  ];
  return (
    <section
      aria-labelledby="chip-live-results"
      className="mt-10 rounded-xl border border-brand/20 bg-brand/6 p-5 md:p-6"
    >
      <h2 id="chip-live-results" className="text-xl font-semibold tracking-tight">
        {t.liveCta}
      </h2>
      <p className="mt-2 leading-7 text-muted-foreground">{t.liveCtaBody}</p>
      <ul className="mt-3 space-y-1">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-sm font-medium text-brand hover:underline">
              {link.label} →
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

const SEMIANALYSIS_MODELS = [
  {
    href: ACCELERATOR_MODEL_URL,
    title: ACCELERATOR_MODEL_TITLE,
    descKey: 'modelsAccDesc',
  },
  {
    href: TCO_SOURCE_URL,
    title: TCO_MODEL_TITLE,
    descKey: 'modelsTcoDesc',
  },
] as const;

const ModelsSection = ({ locale }: { locale: Locale }) => {
  const t = STRINGS[locale];
  return (
    <section aria-labelledby="chip-models" className="mt-10 border-t border-border/50 pt-10">
      <h2 id="chip-models" className="text-xl font-semibold tracking-tight">
        {t.modelsHeading}
      </h2>
      <p className="mt-2 leading-7 text-muted-foreground">{t.modelsBody}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {SEMIANALYSIS_MODELS.map((model) => (
          <a
            key={model.href}
            href={model.href}
            target="_blank"
            rel="noreferrer"
            className="group block h-full"
          >
            <Card className="h-full p-5 transition-colors hover:border-brand/50">
              <h3 className="font-semibold text-brand">
                SemiAnalysis {model.title}
                <ExternalLinkIcon />
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t[model.descKey]}</p>
            </Card>
          </a>
        ))}
      </div>
    </section>
  );
};

export const SpecTable = ({ entry, locale }: { entry: ChipPageEntry; locale: Locale }) => {
  const t = STRINGS[locale];
  const spec = getChipSpec(entry);
  const hw = getChipHw(entry);
  const rows: readonly [string, string][] = [
    [t.specLabels.vendor, hw.vendor],
    [t.specLabels.arch, hw.arch],
    [t.specLabels.memory, `${spec.memory} ${spec.memoryType}`],
    [t.specLabels.memoryBandwidth, spec.memoryBandwidth],
    [t.specLabels.fp4, spec.fp4 ? spec.fp4.toLocaleString('en-US') : t.notSupported],
    [t.specLabels.fp8, spec.fp8.toLocaleString('en-US')],
    [t.specLabels.bf16, spec.bf16.toLocaleString('en-US')],
    [t.specLabels.scaleUp, spec.scaleUpTech],
    [t.specLabels.scaleUpBandwidth, spec.scaleUpBandwidth],
    [t.specLabels.worldSize, String(spec.scaleUpWorldSize)],
    [t.specLabels.scaleUpTopology, spec.scaleUpTopology],
    [t.specLabels.scaleOut, spec.scaleOutTech ?? t.none],
    [t.specLabels.nic, spec.nic ?? t.none],
    [t.specLabels.tdp, `${hw.tdp.toLocaleString('en-US')} W`],
    [t.specLabels.allInPower, `${hw.power} kW`],
    [t.specLabels.costHyperscaler, `$${hw.costh.toFixed(2)}`],
    [t.specLabels.costNeocloud, `$${hw.costn.toFixed(2)}`],
    [t.specLabels.costRetail, `$${hw.costr.toFixed(2)}`],
  ];
  return (
    <div className="relative mt-4">
      <div className="overflow-x-auto rounded-lg border border-border/40">
        <table className="w-full min-w-[36rem] text-sm">
          <tbody className="divide-y divide-border/40">
            {rows.map(([label, value], index) => (
              <tr key={label} className={index % 2 === 1 ? 'bg-muted/10' : undefined}>
                <th
                  scope="row"
                  className="w-[52%] py-2.5 pr-4 text-left font-medium text-muted-foreground"
                >
                  {label}
                </th>
                <td className="whitespace-nowrap py-2.5 text-right font-mono">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground md:hidden">{t.specScrollHint}</p>
      <p className="mt-3 text-sm text-muted-foreground">
        {t.pricingSource}{' '}
        <a
          href={TCO_SOURCE_URL}
          target="_blank"
          rel="noreferrer"
          className="group underline hover:text-foreground"
        >
          {TCO_MODEL_TITLE}
          <ExternalLinkIcon />
        </a>
      </p>
    </div>
  );
};

const RelatedLinks = ({ entry, locale }: { entry: ChipPageEntry; locale: Locale }) => {
  const t = STRINGS[locale];
  const posts = entry.relatedBlogSlugs.flatMap((slug) => {
    const post = getPostBySlug(slug, locale === 'zh' ? 'zh' : undefined) ?? getPostBySlug(slug);
    return post ? [{ slug, title: post.meta.title }] : [];
  });
  const terms = entry.relatedGlossarySlugs.flatMap((slug) => {
    const term = locale === 'zh' ? getZhGlossaryEntry(slug) : getGlossaryEntry(slug);
    return term ? [{ slug, term: term.term }] : [];
  });
  const chips = entry.relatedChipSlugs.flatMap((slug) => {
    const chip = getAllChipPages().find((page) => page.slug === slug);
    return chip ? [chip] : [];
  });
  return (
    <div className="mt-10 grid gap-8 border-t border-border/50 pt-10 md:grid-cols-3">
      <section aria-label={t.relatedArticles}>
        <h2 className="text-sm font-semibold tracking-eyebrow text-muted-foreground uppercase">
          {t.relatedArticles}
        </h2>
        <ul className="mt-3 space-y-2">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={localePath(`/blog/${post.slug}`, locale)}
                className="text-sm text-brand hover:underline"
              >
                {post.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label={t.relatedTerms}>
        <h2 className="text-sm font-semibold tracking-eyebrow text-muted-foreground uppercase">
          {t.relatedTerms}
        </h2>
        <ul className="mt-3 space-y-2">
          {terms.map((term) => (
            <li key={term.slug}>
              <Link
                href={localePath(`/glossary/${term.slug}`, locale)}
                className="text-sm text-brand hover:underline"
              >
                {term.term}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label={t.relatedChips}>
        <h2 className="text-sm font-semibold tracking-eyebrow text-muted-foreground uppercase">
          {t.relatedChips}
        </h2>
        <ul className="mt-3 space-y-2">
          {chips.map((chip) => (
            <li key={chip.slug}>
              <Link
                href={localePath(`/chips/${chip.slug}`, locale)}
                className="text-sm text-brand hover:underline"
              >
                {chip.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export const ChipDetailContent = ({ entry, locale }: { entry: ChipPageEntry; locale: Locale }) => {
  const t = STRINGS[locale];
  const translation = locale === 'zh' ? getZhChipTranslation(entry.slug) : undefined;
  const overview = translation?.overview ?? entry.overview;
  const benchmarkContext = translation?.benchmarkContext ?? entry.benchmarkContext;
  const faq = chipFaq(entry, locale);
  const url = `${SITE_URL}${localePath(`/chips/${entry.slug}`, locale)}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbJsonLd(locale, entry.title, `/chips/${entry.slug}`),
      faqJsonLd(faq, url, locale),
    ],
  };
  const hw = getChipHw(entry);

  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto px-4 lg:px-8">
        <article className="mx-auto max-w-5xl">
          <Card className="overflow-hidden p-0">
            <header className="relative border-b border-border/50 px-5 py-8 md:px-10 md:py-12">
              <Link
                href={localePath('/chips', locale)}
                className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-brand"
              >
                <span aria-hidden="true">←</span>
                {t.backToIndex}
              </Link>
              <div className="mt-8 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-brand/25 bg-brand/8 px-3 py-1 text-xs font-semibold tracking-eyebrow text-brand uppercase">
                  {hw.vendor} · {hw.arch}
                </span>
              </div>
              <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-heading text-balance md:text-6xl">
                {entry.title}
              </h1>
            </header>
            <div className="px-5 py-8 md:px-10 md:py-12">
              <section aria-labelledby="chip-overview">
                <h2 id="chip-overview" className="text-xl font-semibold tracking-tight">
                  {t.overviewHeading}
                </h2>
                {overview.map((paragraph) => (
                  <p key={paragraph.slice(0, 32)} className="mt-3 leading-7 text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </section>
              <section
                aria-labelledby="chip-specs"
                className="mt-10 border-t border-border/50 pt-10"
              >
                <h2 id="chip-specs" className="text-xl font-semibold tracking-tight">
                  {t.specsHeading}
                </h2>
                <SpecTable entry={entry} locale={locale} />
              </section>
              <section
                aria-labelledby="chip-benchmarks"
                className="mt-10 border-t border-border/50 pt-10"
              >
                <h2 id="chip-benchmarks" className="text-xl font-semibold tracking-tight">
                  {t.benchmarkHeading}
                </h2>
                <p className="mt-3 leading-7 text-muted-foreground">{benchmarkContext}</p>
              </section>
              <FaqSection faq={faq} locale={locale} />
              <LiveResultsSection locale={locale} />
              <ModelsSection locale={locale} />
              <RelatedLinks entry={entry} locale={locale} />
            </div>
          </Card>
        </article>
      </div>
    </main>
  );
};

export const ChipVsContent = ({ page, locale }: { page: ChipVsPage; locale: Locale }) => {
  const t = STRINGS[locale];
  const highlights = buildChipVsHighlights(page);
  const labels = locale === 'zh' ? CHIP_VS_HIGHLIGHT_LABELS_ZH : CHIP_VS_HIGHLIGHT_LABELS_EN;
  const faq = vsFaq(page, locale);
  const title = `${page.a.label} vs ${page.b.label}`;
  const url = `${SITE_URL}${localePath(`/chips/${page.slug}`, locale)}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [breadcrumbJsonLd(locale, title, `/chips/${page.slug}`), faqJsonLd(faq, url, locale)],
  };
  const localizeValue = locale === 'zh' ? localizeVsHighlightValueZh : (value: string) => value;

  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto px-4 lg:px-8">
        <article className="mx-auto max-w-5xl">
          <Card className="overflow-hidden p-0">
            <header className="relative border-b border-border/50 px-5 py-8 md:px-10 md:py-12">
              <Link
                href={localePath('/chips', locale)}
                className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-brand"
              >
                <span aria-hidden="true">←</span>
                {t.backToIndex}
              </Link>
              <h1 className="mt-8 max-w-4xl text-4xl font-bold tracking-heading text-balance md:text-6xl">
                {title}
              </h1>
              <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
                {t.vsIntroPrefix}{' '}
                <Link
                  href={localePath(`/chips/${page.a.slug}`, locale)}
                  className="text-brand hover:underline"
                >
                  {page.a.title}
                </Link>{' '}
                {t.vsIntroAnd}{' '}
                <Link
                  href={localePath(`/chips/${page.b.slug}`, locale)}
                  className="text-brand hover:underline"
                >
                  {page.b.title}
                </Link>{' '}
                {t.vsIntroSuffix}
              </p>
            </header>
            <div className="px-5 py-8 md:px-10 md:py-12">
              <section aria-labelledby="vs-table">
                <h2 id="vs-table" className="text-xl font-semibold tracking-tight">
                  {t.vsSpecTableCaption}
                </h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-left">
                        <th className="py-2 pr-4 font-medium text-muted-foreground"> </th>
                        <th className="py-2 pr-4 font-semibold">{page.a.label}</th>
                        <th className="py-2 pr-4 font-semibold">{page.b.label}</th>
                        <th className="py-2 font-medium text-muted-foreground">
                          {page.a.label} / {page.b.label}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {highlights.map((row) => (
                        <tr key={row.key} className="border-b border-border/40">
                          <th
                            scope="row"
                            className="py-2 pr-4 text-left font-medium text-muted-foreground"
                          >
                            {labels[row.key]}
                          </th>
                          <td className="py-2 pr-4 font-mono">{localizeValue(row.aValue)}</td>
                          <td className="py-2 pr-4 font-mono">{localizeValue(row.bValue)}</td>
                          <td className="py-2 font-mono">{row.ratio ?? t.vsRatioNa}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{t.vsRatioNote}</p>
              </section>
              <FaqSection faq={faq} locale={locale} />
              <LiveResultsSection locale={locale} />
              <ModelsSection locale={locale} />
            </div>
          </Card>
        </article>
      </div>
    </main>
  );
};

export const ChipsIndexContent = ({ locale }: { locale: Locale }) => {
  const t = STRINGS[locale];
  const chips = getAllChipPages();
  const vsPages = getAllChipVsPages();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: t.indexTitle,
    itemListElement: chips.map((chip, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: chip.title,
      url: `${SITE_URL}${localePath(`/chips/${chip.slug}`, locale)}`,
    })),
  };
  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto px-4 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <header className="py-8 md:py-12">
            <h1 className="text-4xl font-bold tracking-heading md:text-5xl">{t.indexTitle}</h1>
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">{t.indexIntro}</p>
          </header>
          <section aria-labelledby="chips-list">
            <h2 id="chips-list" className="text-xl font-semibold tracking-tight">
              {t.chipPages}
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {chips.map((chip) => {
                const translation = locale === 'zh' ? getZhChipTranslation(chip.slug) : undefined;
                const summary = translation?.summary ?? chip.summary;
                return (
                  <CatalogLinkCard
                    key={chip.slug}
                    href={localePath(`/chips/${chip.slug}`, locale)}
                    title={chip.title}
                    description={summary}
                    slug={chip.slug}
                    locale={locale}
                    event="chip_index_entry_clicked"
                  />
                );
              })}
            </div>
          </section>
          <section aria-labelledby="vs-list" className="mt-12 pb-12">
            <h2 id="vs-list" className="text-xl font-semibold tracking-tight">
              {t.vsPages}
            </h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {vsPages.map((page) => (
                <li key={page.slug}>
                  <CatalogLinkCard
                    href={localePath(`/chips/${page.slug}`, locale)}
                    title={`${page.a.label} vs ${page.b.label}`}
                    slug={page.slug}
                    locale={locale}
                    event="chip_index_entry_clicked"
                  />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
};
