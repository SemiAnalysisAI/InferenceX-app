'use client';

import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { FEATURED_AGENTX_MODELS } from '@/lib/compare/compare-agentx';
import { GPU_SPECS } from '@/lib/catalog/gpu-specs';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  DASHBOARD_ROUTES,
  dashboardNavTabForPathname,
  getDashboardRoute,
} from '@/lib/routing/dashboard-routes';
import { hasZhSibling, zhPath } from '@/lib/i18n/i18n';
import { TAB_META } from '@/lib/routing/tab-meta';
import { NAV_LABELS_ZH, TAB_LABELS_ZH, TAB_META_ZH } from '@/lib/routing/tab-meta-zh';
import { isEmbedPathname } from '@/lib/embed/embed-route';
import { TAB_LABELS_EN } from '@/components/dashboard/tab-nav';
import { isActive, NAV_LINKS } from '@/components/header/header';
import { InferenceXWordmark } from '@/components/header/inferencex-wordmark';
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

const MORE = {
  en: {
    menu: 'Menu',
    close: 'Close',
    slides: 'Slides',
    previous: 'Previous page',
    next: 'Next page',
    footer: 'Offsite, on sight.',
    billboardTop: 'Inference,',
    billboardBottom: 'on sight.',
    billboardNote:
      'Open, reproducible benchmarks for every major accelerator. Updated every night from public GitHub Actions runs.',
    zineHeadline: ['Open', 'benchmarks.', 'No', 'vibes.'],
    zineNote: 'Every point on every chart links to the run that produced it. Check our work.',
    stamp: 'Every point is a public run • Primary sources • ',
    bentoTitle: 'Inference performance, on sight.',
    section: 'Section',
    home: 'InferenceX',
  },
  zh: {
    menu: '菜单',
    close: '关闭',
    slides: '页面',
    previous: '上一页',
    next: '下一页',
    footer: 'Offsite, on sight.',
    billboardTop: '推理性能，',
    billboardBottom: '一目了然。',
    billboardNote: '覆盖主流加速器的开放、可复现基准测试，每晚由公开的 GitHub Actions 运行更新。',
    zineHeadline: ['开放', '基准', '不靠', '感觉。'],
    zineNote: '每张图表上的每个点都链接到产生它的那次运行。欢迎核查。',
    stamp: '每个数据点都是一次公开运行 • 一手数据 • ',
    bentoTitle: '推理性能，一目了然。',
    section: '章节',
    home: 'InferenceX',
  },
} as const;

const TONES = ['yellow', 'blue', 'navy', 'yellow', 'blue', 'navy'] as const;

function useSiteSections(pathname: string, locale: Locale) {
  const links = NAV_LINKS.map((link) => {
    const target = link.path ?? link.href;
    return {
      href: link.href,
      label: locale === 'zh' ? (NAV_LABELS_ZH[link.href] ?? link.label) : link.label,
      displayHref: locale === 'zh' && hasZhSibling(link.href) ? zhPath(target) : target,
      active: isActive(pathname, link.href),
    };
  });
  const index = links.findIndex((link) => link.active);
  const tab = dashboardNavTabForPathname(pathname);
  const tabLabel = tab ? (locale === 'zh' ? TAB_LABELS_ZH[tab] : TAB_LABELS_EN[tab]) : null;
  const title = tabLabel ?? (index === 0 ? MORE[locale].home : (links[index]?.label ?? ''));
  const description = tab ? (locale === 'zh' ? TAB_META_ZH : TAB_META)[tab].description : null;
  return { links, index, title, description, tab };
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Keynote: a slide sorter down the left and presenter controls at the bottom. */
function KeynoteChrome({ pathname, locale }: { pathname: string; locale: Locale }) {
  const router = useRouter();
  const { links, index } = useSiteSections(pathname, locale);
  const t = MORE[locale];
  const go = (delta: number) => {
    const next = links[(Math.max(index, 0) + delta + links.length) % links.length];
    router.push(next.displayHref);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input,textarea,select,[contenteditable],[role=listbox],[role=menu],svg'))
        return;
      if (target && target !== document.body) return;
      go(event.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <>
      <aside className="sa-keynote-sorter" aria-label={t.slides} data-testid="sa-keynote-sorter">
        <p className="sa-keynote-sorter-title">{t.slides}</p>
        <ol>
          {links.map((link, i) => (
            <li key={link.href}>
              <span className="sa-keynote-index">{i + 1}</span>
              <Link
                href={link.displayHref}
                aria-current={link.active ? 'page' : undefined}
                className="sa-keynote-thumb"
              >
                <span className={cn('sa-keynote-thumb-art', `sa-tone-${TONES[i]}`)}>
                  <span className="sa-keynote-thumb-number">{pad(i + 1)}</span>
                </span>
                <span className="sa-keynote-thumb-label">{link.label}</span>
              </Link>
            </li>
          ))}
        </ol>
      </aside>
      <div className="sa-keynote-controls" data-testid="sa-keynote-controls">
        <button type="button" onClick={() => go(-1)} aria-label={t.previous}>
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <span className="sa-keynote-counter">
          {index >= 0 ? pad(index + 1) : '--'} <span>/ {pad(links.length)}</span>
        </span>
        <button type="button" onClick={() => go(1)} aria-label={t.next}>
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
        <span className="sa-keynote-tagline">{t.footer}</span>
      </div>
    </>
  );
}

/** Split: a fixed poster half with the section title and the site navigation. */
function SplitPanel({ pathname, locale }: { pathname: string; locale: Locale }) {
  const { links, index, title, description } = useSiteSections(pathname, locale);
  const enPath = pathname.replace(/^\/zh(?=\/|$)/u, '') || '/';
  const poster = index === 0 ? POSTERS.goldenGate : posterForPath(enPath);
  return (
    <aside className="sa-split" data-testid="sa-split-panel">
      <Poster poster={poster} className="sa-split-poster" eager />
      <div className="sa-split-shade" aria-hidden="true" />
      <Link href={locale === 'zh' ? '/zh' : '/'} className="sa-split-brand">
        <InferenceXWordmark />
        <img
          src="/decorative/semianalysis/logo-white.webp"
          alt="SemiAnalysis"
          width={96}
          height={40}
        />
      </Link>
      <nav className="sa-split-nav">
        {links.map((link, i) => (
          <Link
            key={link.href}
            href={link.displayHref}
            aria-current={link.active ? 'page' : undefined}
          >
            <span>{pad(i + 1)}</span>
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="sa-split-title">
        <p className="sa-split-number">{index >= 0 ? pad(index + 1) : '··'}</p>
        <p className="sa-split-heading">{title}</p>
        {description && <p className="sa-split-description">{description}</p>}
      </div>
    </aside>
  );
}

/** Billboard: one huge MENU button that opens a full-screen agenda. */
function BillboardMenu({ pathname, locale }: { pathname: string; locale: Locale }) {
  const [open, setOpen] = useState(false);
  const { links } = useSiteSections(pathname, locale);
  const t = MORE[locale];
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    document.documentElement.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = '';
    };
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="sa-billboard-menu-button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="sa-billboard-menu-button"
      >
        {open ? (
          <X className="size-5" aria-hidden="true" />
        ) : (
          <Menu className="size-5" aria-hidden="true" />
        )}
        {open ? t.close : t.menu}
      </button>
      {open && (
        <div className="sa-billboard-overlay" role="dialog" aria-modal="true" aria-label={t.menu}>
          <nav>
            {links.map((link, i) => (
              <Link
                key={link.href}
                href={link.displayHref}
                aria-current={link.active ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                <span>{pad(i + 1)}</span>
                {link.label}
              </Link>
            ))}
          </nav>
          <Poster poster={POSTERS.coitTower} className="sa-billboard-overlay-poster" eager />
        </div>
      )}
    </>
  );
}

function BillboardHero({ locale }: { locale: Locale }) {
  const t = MORE[locale];
  return (
    <section className="sa-billboard" data-testid="sa-billboard-hero">
      <p className="sa-billboard-line">{t.billboardTop}</p>
      <p className="sa-billboard-line sa-billboard-line-outline">{t.billboardBottom}</p>
      <div className="sa-billboard-foot">
        <p>{t.billboardNote}</p>
        <Link
          href={localeHref(locale, getDashboardRoute('inference').path)}
          className="sa-button sa-button-navy"
        >
          {STRINGS[locale].dashboard}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="sa-billboard-film" aria-hidden="true">
        {POSTER_LIST.map((poster, i) => (
          <div key={poster.src} className="sa-billboard-frame">
            <Poster poster={poster} eager />
            <span>{STRINGS[locale].ticker[i % STRINGS[locale].ticker.length]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function BillboardTitle({ pathname, locale }: { pathname: string; locale: Locale }) {
  const { title, description } = useSiteSections(pathname, locale);
  const tab = dashboardNavTabForPathname(pathname);
  const index = DASHBOARD_ROUTES.filter((route) => route.navGroup === 'primary').findIndex(
    (route) => route.key === tab,
  );
  return (
    <div className="container mx-auto px-4 lg:px-8">
      <section className="sa-billboard-title" data-testid="sa-billboard-title">
        <p className="sa-billboard-title-number">{pad(index + 1)}</p>
        <p className="sa-billboard-title-text">{title}</p>
        {description && <p className="sa-billboard-title-note">{description}</p>}
      </section>
    </div>
  );
}

/** Zine: taped posters, a spinning stamp and a marker-highlighted headline. */
function ZineHero({ locale }: { locale: Locale }) {
  const t = MORE[locale];
  return (
    <section className="sa-zine" data-testid="sa-zine-hero">
      <div className="sa-zine-copy">
        <p className="sa-zine-sticker">SemiAnalysis × InferenceX</p>
        <h2 className="sa-zine-headline">
          {t.zineHeadline.map((word, i) => (
            <span key={i} className={i % 2 ? 'sa-zine-mark' : undefined}>
              {word}{' '}
            </span>
          ))}
        </h2>
        <p className="sa-zine-note">{t.zineNote}</p>
        <Link
          href={localeHref(locale, getDashboardRoute('inference').path)}
          className="sa-zine-button"
        >
          {STRINGS[locale].dashboard} <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="sa-zine-collage" aria-hidden="true">
        <Poster poster={POSTERS.paintedLadies} className="sa-zine-photo sa-zine-photo-1" eager />
        <Poster poster={POSTERS.goldenGate} className="sa-zine-photo sa-zine-photo-2" eager />
        <Poster poster={POSTERS.fishingBoat} className="sa-zine-photo sa-zine-photo-3" eager />
        <svg className="sa-zine-stamp" viewBox="0 0 200 200">
          <defs>
            <path id="sa-stamp-circle" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
          </defs>
          <circle cx="100" cy="100" r="98" />
          <text>
            <textPath href="#sa-stamp-circle" textLength="486" lengthAdjust="spacingAndGlyphs">
              {t.stamp}
            </textPath>
          </text>
          <text x="100" y="118" textAnchor="middle" className="sa-zine-stamp-x">
            X
          </text>
        </svg>
      </div>
    </section>
  );
}

/** Bento: the home page as one mosaic of slide tiles. */
function BentoHome({ locale }: { locale: Locale }) {
  const t = STRINGS[locale];
  const m = MORE[locale];
  return (
    <section className="sa-bento" data-testid="sa-bento-home">
      <div className="sa-bento-tile sa-bento-title sa-tone-yellow">
        <p className="sa-eyebrow sa-eyebrow-navy">{t.eyebrow}</p>
        <p className="sa-bento-headline">{m.bentoTitle}</p>
        <p className="sa-bento-copy">{t.coverDescription}</p>
      </div>
      <div className="sa-bento-tile sa-bento-poster">
        <Poster poster={POSTERS.lombardStreet} eager />
      </div>
      <div className="sa-bento-tile sa-bento-stat sa-tone-blue">
        <p className="sa-number-value">1,000+</p>
        <p className="sa-number-label">{t.weekly}</p>
      </div>
      <div className="sa-bento-tile sa-bento-stat sa-tone-navy">
        <p className="sa-number-value">{GPU_SPECS.length}</p>
        <p className="sa-number-label">{t.chips}</p>
      </div>
      <Link
        href={localeHref(locale, getDashboardRoute('inference').path)}
        className="sa-bento-tile sa-bento-cta sa-tone-navy"
      >
        <span>{t.dashboard}</span>
        <ArrowUpRight className="size-10" aria-hidden="true" />
      </Link>
      <div className="sa-bento-tile sa-bento-quote">
        <span className="sa-quote-mark" aria-hidden="true">
          &ldquo;
        </span>
        <blockquote>{t.quote}</blockquote>
        <p>{t.quoteBy}</p>
      </div>
      <Link
        href={localeHref(locale, getDashboardRoute('profit-estimator-per-gigawatt').path)}
        className="sa-bento-tile sa-bento-cta sa-tone-blue"
      >
        <span>{t.calculator}</span>
        <ArrowUpRight className="size-10" aria-hidden="true" />
      </Link>
      <div className="sa-bento-tile sa-bento-stat sa-tone-yellow">
        <p className="sa-number-value">{FEATURED_AGENTX_MODELS.length}</p>
        <p className="sa-number-label">{t.models}</p>
      </div>
    </section>
  );
}

/** Zine: a strip of packing tape across the top carrying the slogans. */
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
      {SA_LAYOUTS.map((id: SaLayout, i) => (
        <button key={id} type="button" aria-pressed={layout === id} onClick={() => setSaLayout(id)}>
          {i + 1} {SA_LAYOUT_LABELS[id][locale]}
        </button>
      ))}
    </div>
  );
}

/** Chrome around the page. What it renders depends on the layout experiment and route. */
export function SemiAnalysisChrome() {
  const layout = useSaLayout();
  const locale = useLocale();
  const mounted = useMounted();
  const pathname = usePathname() ?? '/';
  if (!mounted || isEmbedPathname(pathname)) return null;
  if (layout === 'keynote') return <KeynoteChrome pathname={pathname} locale={locale} />;
  if (layout === 'split') return <SplitPanel pathname={pathname} locale={locale} />;
  if (layout === 'billboard') {
    return (
      <>
        <BillboardMenu pathname={pathname} locale={locale} />
        {dashboardNavTabForPathname(pathname) && (
          <BillboardTitle pathname={pathname} locale={locale} />
        )}
      </>
    );
  }
  return null;
}

/** Rendered above the header. */
export function SemiAnalysisTopStrip() {
  const layout = useSaLayout();
  const locale = useLocale();
  const mounted = useMounted();
  const pathname = usePathname() ?? '/';
  if (!mounted || layout !== 'zine' || isEmbedPathname(pathname)) return null;
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
  if (slot === 'top') {
    if (layout === 'keynote') return <CoverSlide locale={locale} />;
    if (layout === 'zine') return <ZineHero locale={locale} />;
    if (layout === 'billboard') return <BillboardHero locale={locale} />;
    if (layout === 'bento') return <BentoHome locale={locale} />;
    return null;
  }
  if (slot === 'after-hero') {
    if (layout === 'keynote' || layout === 'split') return <StatTiles locale={locale} />;
    return null;
  }
  if (layout === 'keynote' || layout === 'split' || layout === 'billboard')
    return <QuoteSlide locale={locale} />;
  return null;
}
