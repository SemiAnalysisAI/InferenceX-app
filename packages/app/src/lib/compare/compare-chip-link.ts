import { getAllChipVsPages, type ChipVsPage } from '@/lib/catalog/chip-pages';

export interface CompareChipPageLink {
  /** The `/chips/<slug>` versus-page slug, in the order the chip page registers it. */
  slug: string;
  href: string;
  label: string;
}

/**
 * Resolve the `/chips/X-vs-Y` page for a compare-page GPU pair, matching either order.
 * Compare slugs use HW_REGISTRY keys (`gb200`), chip pages map them through `hwKey`.
 */
export function findChipVsPageForPair(a: string, b: string): ChipVsPage | undefined {
  const pair = new Set([a.toLowerCase(), b.toLowerCase()]);
  if (pair.size !== 2) return undefined;
  return getAllChipVsPages().find((page) => pair.has(page.a.hwKey) && pair.has(page.b.hwKey));
}

/** Link from a model-specific compare page to the generic chip-vs-chip page, or null if none exists. */
export function compareChipPageLink(
  a: string,
  b: string,
  locale: 'en' | 'zh',
): CompareChipPageLink | null {
  const page = findChipVsPageForPair(a, b);
  if (!page) return null;
  const vs = `${page.a.label} vs ${page.b.label}`;
  return {
    slug: page.slug,
    href: locale === 'zh' ? `/zh/chips/${page.slug}` : `/chips/${page.slug}`,
    label:
      locale === 'zh'
        ? `${vs}：完整规格与各模型基准测试`
        : `${vs}: full specs & benchmarks across models`,
  };
}
