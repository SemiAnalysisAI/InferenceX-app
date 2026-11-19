'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { FEATURED_AGENTX_MODELS } from '@/lib/compare/compare-agentx';
import { GPU_SPECS } from '@/lib/catalog/gpu-specs';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  AGENTX_ROUTE,
  DASHBOARD_ROUTES,
  dashboardNavTabForPathname,
  getDashboardRoute,
  type DashboardRouteKey,
} from '@/lib/routing/dashboard-routes';
import { TAB_META } from '@/lib/routing/tab-meta';
import { TAB_LABELS_ZH, TAB_META_ZH } from '@/lib/routing/tab-meta-zh';
import { isEmbedPathname } from '@/lib/embed/embed-route';
import { TAB_LABELS_EN } from '@/components/dashboard/tab-nav';
import { cn } from '@/lib/shared/utils';

import {
  SA_LAYOUT_LABELS,
  SA_LAYOUTS,
  setSaLayout,
  useSaLayout,
  type SaLayout,
} from './layout-variant';

type Locale = 'en' | 'zh';

export const POSTERS = {
  goldenGate: { src: '/decorative/semianalysis/golden-gate.webp', position: '50% 62%' },
  coitTower: { src: '/decorative/semianalysis/coit-tower.webp', position: '50% 76%' },
  paintedLadies: { src: '/decorative/semianalysis/painted-ladies.webp', position: '50% 58%' },
  fishingBoat: { src: '/decorative/semianalysis/fishing-boat.webp', position: '50% 70%' },
  lombardStreet: { src: '/decorative/semianalysis/lombard-street.webp', position: '50% 92%' },
} as const;
const POSTER_LIST = Object.values(POSTERS);

const STRINGS = {
  en: {
    eyebrow: 'SemiAnalysis × InferenceX',
    coverTitle: 'Compare realistic agentic inference performance',
    coverDescription:
      'Long-context, multi-turn inference on every major accelerator. Every data point traces back to a public GitHub Actions run.',
    dashboard: 'Open the dashboard',
    calculator: 'Token revenue calculator',
    chapter: 'Chapter',
    numbersEyebrow: 'By the numbers',
    numbersTitle: 'InferenceX in three numbers',
    weekly: 'New datapoints every week',
    weeklyNote: 'Each one produced by a public GitHub Actions run.',
    models: 'Models with AgentX results',
    modelsNote: 'Long-context, multi-turn coding traces.',
    chips: 'Accelerators in the spec catalog',
    chipsNote: 'NVIDIA, AMD, Google, Huawei and more.',
    quoteEyebrow: 'What the field says',
    quote: 'The industry needs many public, reproducible benchmarks of inference performance.',
    quoteBy: 'Simon Mo, vLLM Project Co-Lead',
    agendaEyebrow: 'The plan',
    agendaTitle: 'Where to start',
    agenda: [
      ['Dashboard', 'Throughput, latency and cost per token across chips'],
      ['AgentX', 'Agentic, multi-turn coding workloads'],
      ['uBenchX', 'Microbenchmarks for memory and compute'],
      ['About', 'How every result is reproduced'],
    ],
    layout: 'Layout',
    ticker: [
      'Open benchmarks, on sight.',
      'Every point is a public run.',
      'Primary sources.',
      'Higher ground. Deeper analysis.',
    ],
  },
  zh: {
    eyebrow: 'SemiAnalysis × InferenceX',
    coverTitle: '真实智能体工作负载下的推理性能对比',
    coverDescription:
      '覆盖主流加速器的长上下文、多轮推理性能。每个数据点都可追溯到一次公开的 GitHub Actions 运行。',
    dashboard: '打开仪表板',
    calculator: 'Token 收入计算器',
    chapter: '章节',
    numbersEyebrow: '数据一览',
    numbersTitle: '三个数字看 InferenceX',
    weekly: '每周新增数据点',
    weeklyNote: '每个数据点都来自一次公开的 GitHub Actions 运行。',
    models: '已发布 AgentX 结果的模型',
    modelsNote: '长上下文、多轮编程轨迹。',
    chips: '规格目录中的加速器',
    chipsNote: 'NVIDIA、AMD、Google、华为等。',
    quoteEyebrow: '业界评价',
    quote: '行业需要大量公开、可复现的推理性能基准测试。',
    quoteBy: 'Simon Mo，vLLM 项目联合负责人',
    agendaEyebrow: '导览',
    agendaTitle: '从这里开始',
    agenda: [
      ['仪表板', '跨芯片对比吞吐、延迟与每 token 成本'],
      ['AgentX', '智能体多轮编程工作负载'],
      ['uBenchX', '内存与算力微基准测试'],
      ['关于', '每个结果如何复现'],
    ],
    layout: '布局',
    ticker: [
      '开放基准测试，一目了然。',
      '每个数据点都是一次公开运行。',
      '一手数据。',
      '登高望远，深入分析。',
    ],
  },
} as const;

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function localeHref(locale: Locale, path: string) {
  return locale === 'zh' ? `/zh${path === '/' ? '' : path}` : path;
}

function Poster({
  poster,
  className,
  eager,
}: {
  poster: (typeof POSTER_LIST)[number];
  className?: string;
  eager?: boolean;
}) {
  return (
    <img
      className={cn('sa-poster', className)}
      src={poster.src}
      style={{ objectPosition: poster.position }}
      alt=""
      aria-hidden="true"
      width={720}
      height={960}
      decoding="async"
      loading={eager ? 'eager' : 'lazy'}
      draggable={false}
    />
  );
}

function posterForPath(pathname: string) {
  let hash = 0;
  for (const char of pathname) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 1_000_003;
  return POSTER_LIST[hash % POSTER_LIST.length];
}

/** Variant A home: the template's title slide. Yellow copy panel, full-height poster. */
export function CoverSlide({ locale }: { locale: Locale }) {
  const t = STRINGS[locale];
  return (
    <section className="sa-cover" data-testid="sa-cover-slide">
      <div className="sa-cover-copy">
        <p className="sa-eyebrow sa-eyebrow-navy">{t.eyebrow}</p>
        <p className="sa-cover-title">{t.coverTitle}</p>
        <p className="sa-cover-description">{t.coverDescription}</p>
        <div className="sa-cover-actions">
          <Link
            href={localeHref(locale, getDashboardRoute('inference').path)}
            className="sa-button sa-button-navy"
          >
            {t.dashboard}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link
            href={localeHref(locale, getDashboardRoute('profit-estimator-per-gigawatt').path)}
            className="sa-button sa-button-outline"
          >
            {t.calculator}
          </Link>
        </div>
      </div>
      <Poster poster={POSTERS.goldenGate} className="sa-cover-poster" eager />
    </section>
  );
}

const CHAPTER_TABS = DASHBOARD_ROUTES.filter((route) => route.navGroup === 'primary');

/** Variant A dashboard: the template's chapter divider (big yellow number on blue). */
export function ChapterSlide({ tab, locale }: { tab: DashboardRouteKey; locale: Locale }) {
  const t = STRINGS[locale];
  const index = CHAPTER_TABS.findIndex((route) => route.key === tab);
  const number = String((index === -1 ? CHAPTER_TABS.length : index) + 1).padStart(2, '0');
  const title = locale === 'zh' ? TAB_LABELS_ZH[tab] : TAB_LABELS_EN[tab];
  const description = (locale === 'zh' ? TAB_META_ZH : TAB_META)[tab].description;
  return (
    <section className="sa-chapter" data-testid="sa-chapter-slide">
      <div className="sa-chapter-copy">
        <p className="sa-chapter-number" aria-hidden="true">
          {number}
        </p>
        <div>
          <p className="sa-chapter-kicker">
            {t.chapter} {number}
          </p>
          <p className="sa-chapter-title">{title}</p>
          <p className="sa-chapter-description">{description}</p>
        </div>
      </div>
      <Poster poster={posterForPath(tab)} className="sa-chapter-poster" eager />
    </section>
  );
}

/** "2026 in three numbers": solid yellow, blue and navy stat tiles. */
export function StatTiles({ locale }: { locale: Locale }) {
  const t = STRINGS[locale];
  const tiles = [
    { value: '1,000+', label: t.weekly, note: t.weeklyNote, tone: 'yellow' },
    {
      value: String(FEATURED_AGENTX_MODELS.length),
      label: t.models,
      note: t.modelsNote,
      tone: 'blue',
    },
    { value: String(GPU_SPECS.length), label: t.chips, note: t.chipsNote, tone: 'navy' },
  ] as const;
  return (
    <section className="sa-numbers" data-testid="sa-stat-tiles">
      <p className="sa-eyebrow">{t.numbersEyebrow}</p>
      <h2 className="sa-slide-title">{t.numbersTitle}</h2>
      <div className="sa-numbers-grid">
        {tiles.map((tile) => (
          <div key={tile.label} className={cn('sa-number-tile', `sa-tone-${tile.tone}`)}>
            <p className="sa-number-value">{tile.value}</p>
            <p className="sa-number-label">{tile.label}</p>
            <p className="sa-number-note">{tile.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** "One bold line the room will still be arguing about at dinner." */
export function QuoteSlide({ locale }: { locale: Locale }) {
  const t = STRINGS[locale];
  return (
    <section className="sa-quote" data-testid="sa-quote-slide">
      <p className="sa-eyebrow sa-eyebrow-navy">{t.quoteEyebrow}</p>
      <span className="sa-quote-mark" aria-hidden="true">
        &ldquo;
      </span>
      <blockquote className="sa-quote-text">{t.quote}</blockquote>
      <p className="sa-quote-by">{t.quoteBy}</p>
    </section>
  );
}

/** The agenda slide: four numbered colour blocks. */
export function AgendaTiles({ locale }: { locale: Locale }) {
  const t = STRINGS[locale];
  const hrefs = [getDashboardRoute('inference').path, AGENTX_ROUTE.path, '/ubx/mem-bw', '/about'];
  return (
    <section className="sa-agenda" data-testid="sa-agenda-tiles">
      <p className="sa-eyebrow">{t.agendaEyebrow}</p>
      <h2 className="sa-slide-title">{t.agendaTitle}</h2>
      <div className="sa-agenda-grid">
        {t.agenda.map(([label, note], index) => (
          <Link key={label} href={localeHref(locale, hrefs[index])} className="sa-agenda-item">
            <span className={cn('sa-agenda-number', index % 2 ? 'sa-tone-blue' : 'sa-tone-yellow')}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="sa-agenda-label">{label}</span>
            <span className="sa-agenda-note">{note}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Variant C: a scrolling slogan strip above the header, like the poster taglines. */
export function TickerStrip({ locale }: { locale: Locale }) {
  const items = STRINGS[locale].ticker;
  const run = [...items, ...items, ...items];
  return (
    <div className="sa-ticker" aria-hidden="true" data-testid="sa-ticker">
      <div className="sa-ticker-track">
        {run.map((item, index) => (
          <span key={index}>{item}</span>
        ))}
      </div>
    </div>
  );
}

/** Floating picker so one preview can compare the layout experiments. */
export function LayoutSwitcher() {
  const layout = useSaLayout();
  const locale = useLocale();
  const mounted = useMounted();
  const pathname = usePathname() ?? '/';
  if (!mounted || isEmbedPathname(pathname)) return null;
  return (
    <div className="sa-layout-switcher" data-testid="sa-layout-switcher">
      <span>{STRINGS[locale].layout}</span>
      {SA_LAYOUTS.map((id: SaLayout) => (
        <button
          key={id}
          type="button"
          aria-pressed={layout === id}
          onClick={() => setSaLayout(id)}
          title={SA_LAYOUT_LABELS[id][locale]}
        >
          {SA_LAYOUT_LABELS[id][locale].split(' · ')[0]}
        </button>
      ))}
    </div>
  );
}

/** Page chrome under the header. What it renders depends on the layout experiment and route. */
export function SemiAnalysisChrome() {
  const layout = useSaLayout();
  const locale = useLocale();
  const mounted = useMounted();
  const pathname = usePathname() ?? '/';
  if (!mounted || isEmbedPathname(pathname)) return null;
  const enPath = pathname.replace(/^\/zh(?=\/|$)/u, '') || '/';
  const tab = dashboardNavTabForPathname(pathname);

  if (layout !== 'cover' || enPath === '/') return null;
  if (tab) {
    return (
      <div className="container mx-auto px-4 lg:px-8">
        <ChapterSlide tab={tab} locale={locale} />
      </div>
    );
  }
  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="semianalysis-theme-banner">
      <div className="semianalysis-banner">
        <div className="semianalysis-banner-copy">
          <p className="semianalysis-eyebrow">{STRINGS[locale].eyebrow}</p>
          <p className="semianalysis-banner-title">{STRINGS[locale].ticker[0]}</p>
        </div>
        <Poster poster={posterForPath(enPath)} className="semianalysis-banner-poster" eager />
      </div>
    </div>
  );
}

/** Ticker for variant C, rendered above the header. */
export function SemiAnalysisTopStrip() {
  const layout = useSaLayout();
  const locale = useLocale();
  const mounted = useMounted();
  const pathname = usePathname() ?? '/';
  if (!mounted || layout !== 'poster' || isEmbedPathname(pathname)) return null;
  return <TickerStrip locale={locale} />;
}

/** Extra home-page slides for each layout experiment. */
export function SemiAnalysisLandingSlides({
  locale,
  slot,
}: {
  locale: Locale;
  slot: 'top' | 'after-hero' | 'end';
}) {
  const layout = useSaLayout();
  const mounted = useMounted();
  if (!mounted) return null;
  if (layout === 'cover') {
    if (slot === 'top') return <CoverSlide locale={locale} />;
    if (slot === 'after-hero') return <StatTiles locale={locale} />;
    return null;
  }
  if (layout === 'rail') {
    if (slot === 'after-hero') return <AgendaTiles locale={locale} />;
    if (slot === 'end') return <StatTiles locale={locale} />;
    return null;
  }
  if (slot === 'top') return <StatTiles locale={locale} />;
  if (slot === 'end') return <QuoteSlide locale={locale} />;
  return null;
}
