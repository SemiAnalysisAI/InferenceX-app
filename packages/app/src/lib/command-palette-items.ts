/**
 * Navigation registry for the global command palette (⌘K / Ctrl+K).
 *
 * Pure data + builders so the item catalog is unit-testable without React.
 * The palette component resolves each English `href` to its `/zh` sibling at
 * selection time (via `hasZhSibling`/`zhPath`), so hrefs here are always the
 * English path — the same convention the header nav uses.
 *
 * Chip entries are a deliberately hardcoded slug/label list instead of an
 * import from `chip-pages.ts`: that module carries page prose for nine chips
 * plus every versus page, which the header (and therefore every page) should
 * not pull into the client bundle for a name list.
 * `command-palette-items.test.ts` pins every slug against `getAllChipSlugs()`
 * so the two can never drift.
 */
import { DASHBOARD_ROUTES, type DashboardRouteKey } from '@/lib/dashboard-routes';
import { type Locale } from '@/lib/i18n';
import { ACTIVE_INFERENCE_MODEL_SLUGS, inferenceModelPath } from '@/lib/inference-model-slug';
import { TAB_LABELS_EN } from '@/lib/tab-meta';
import { NAV_LABELS_ZH, TAB_LABELS_ZH } from '@/lib/tab-meta-zh';

export type PaletteGroupKey = 'pages' | 'dashboard' | 'models' | 'chips';

export interface PaletteNavItem {
  /** Stable id, also used for analytics. */
  id: string;
  group: PaletteGroupKey;
  /** English pathname; the palette maps it to the /zh sibling when needed. */
  href: `/${string}`;
  /** Locale-resolved display label. */
  label: string;
  /** Extra terms a user might type; matched but never displayed. */
  keywords?: string;
}

export const PALETTE_GROUP_LABELS: Record<PaletteGroupKey, { en: string; zh: string }> = {
  pages: { en: 'Pages', zh: '页面' },
  dashboard: { en: 'Dashboard', zh: '仪表板' },
  models: { en: 'Models', zh: '模型' },
  chips: { en: 'Chips', zh: '芯片' },
};

/** Site pages beyond the header nav. Labels mirror NAV_LABELS_ZH where they exist. */
const PAGES: readonly { href: `/${string}`; en: string; zh: string; keywords?: string }[] = [
  { href: '/', en: 'Home', zh: NAV_LABELS_ZH['/'], keywords: 'landing start' },
  { href: '/agentx', en: 'AgentX', zh: NAV_LABELS_ZH['/agentx'], keywords: 'agentic benchmark' },
  { href: '/overview', en: 'Overview', zh: NAV_LABELS_ZH['/overview'], keywords: 'matrix summary' },
  {
    href: '/compare',
    en: 'Comparisons',
    zh: NAV_LABELS_ZH['/compare'],
    keywords: 'versus vs head to head 对比',
  },
  {
    href: '/blog',
    en: 'Articles',
    zh: NAV_LABELS_ZH['/blog'],
    keywords: 'blog posts news 博客 文章',
  },
  { href: '/about', en: 'About', zh: NAV_LABELS_ZH['/about'], keywords: 'methodology faq 关于' },
  { href: '/chips', en: 'AI Chips', zh: '芯片总览', keywords: 'gpu hardware specs 硬件' },
  { href: '/rankings', en: 'Rankings', zh: '排行榜', keywords: 'leaderboard best 排名' },
  { href: '/glossary', en: 'Glossary', zh: '术语表', keywords: 'terms definitions 词汇' },
  { href: '/quotes', en: 'Supporter Quotes', zh: '支持者评价', keywords: 'endorsements 引用' },
  { href: '/api', en: 'API Reference', zh: 'API 参考', keywords: 'openapi docs endpoints 文档' },
];

/**
 * Chip pages served by /chips/[slug]. Keep in sync with `chip-pages.ts`
 * (pinned by test, see module doc).
 */
export const PALETTE_CHIPS: readonly { slug: string; label: string; keywords: string }[] = [
  { slug: 'h100', label: 'NVIDIA H100 SXM', keywords: 'hopper gpu' },
  { slug: 'h200', label: 'NVIDIA H200 SXM', keywords: 'hopper gpu' },
  { slug: 'b200', label: 'NVIDIA B200', keywords: 'blackwell gpu' },
  { slug: 'b300', label: 'NVIDIA B300', keywords: 'blackwell ultra gpu' },
  { slug: 'gb200-nvl72', label: 'NVIDIA GB200 NVL72', keywords: 'blackwell grace rack gpu' },
  { slug: 'gb300-nvl72', label: 'NVIDIA GB300 NVL72', keywords: 'blackwell ultra grace rack gpu' },
  { slug: 'mi300x', label: 'AMD Instinct MI300X', keywords: 'cdna gpu' },
  { slug: 'mi325x', label: 'AMD Instinct MI325X', keywords: 'cdna gpu' },
  { slug: 'mi355x', label: 'AMD Instinct MI355X', keywords: 'cdna gpu' },
];

const PRIMARY_TAB_ROUTES = DASHBOARD_ROUTES.filter((route) => route.navGroup === 'primary');

/** Build the full, ordered nav-item catalog for one locale. */
export function buildPaletteNavItems(locale: Locale): PaletteNavItem[] {
  const pages: PaletteNavItem[] = PAGES.map((page) => ({
    id: `page:${page.href}`,
    group: 'pages',
    href: page.href,
    label: locale === 'zh' ? page.zh : page.en,
    // Keep the other locale's label searchable so e.g. "glossary" still hits on /zh.
    keywords: [locale === 'zh' ? page.en : page.zh, page.keywords].filter(Boolean).join(' '),
  }));

  const dashboard: PaletteNavItem[] = PRIMARY_TAB_ROUTES.map((route) => {
    const key = route.key as DashboardRouteKey;
    return {
      id: `tab:${key}`,
      group: 'dashboard',
      href: route.path,
      label: locale === 'zh' ? TAB_LABELS_ZH[key] : TAB_LABELS_EN[key],
      // Include the header's "Dashboard" label (both locales) so the words
      // users actually see in the nav also hit these destinations.
      keywords: `${locale === 'zh' ? TAB_LABELS_EN[key] : TAB_LABELS_ZH[key]} dashboard 仪表板`,
    };
  });

  // Model and chip names stay English in both locales (site convention).
  const models: PaletteNavItem[] = ACTIVE_INFERENCE_MODEL_SLUGS.map((m) => ({
    id: `model:${m.slug}`,
    group: 'models',
    href: inferenceModelPath(m.slug) as `/${string}`,
    label: m.label,
    keywords: `${m.seoName} ${m.model} ${m.slug}`,
  }));

  const chips: PaletteNavItem[] = PALETTE_CHIPS.map((chip) => ({
    id: `chip:${chip.slug}`,
    group: 'chips',
    href: `/chips/${chip.slug}`,
    label: chip.label,
    keywords: chip.keywords,
  }));

  return [...pages, ...dashboard, ...models, ...chips];
}
