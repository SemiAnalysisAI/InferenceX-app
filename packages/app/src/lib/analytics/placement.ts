/**
 * Marks a page region for analytics. Click events read the nearest ancestor's value as `placement`
 * (for example `header_desktop`, `footer`, `blog_article`), so one event name can be split by where
 * the user clicked it.
 */
export const ANALYTICS_PLACEMENT_ATTRIBUTE = 'data-analytics-placement';

export type AnalyticsPlacement =
  /** Header bar controls shown at every width (logo, star, search, language, menu toggle). */
  | 'header'
  /** Header nav links, shown on wide screens. */
  | 'header_desktop'
  /** The header's mobile menu. */
  | 'header_mobile'
  | 'footer'
  | 'landing_hero'
  /** Landing page sections below the hero. */
  | 'landing_section'
  | 'blog_article'
  | 'glossary'
  | 'compare'
  | 'revenue-capacity'
  | 'chips';

/** Spread onto an element: `<nav {...analyticsPlacement('footer')}>`. */
export function analyticsPlacement(placement: AnalyticsPlacement): {
  [ANALYTICS_PLACEMENT_ATTRIBUTE]: AnalyticsPlacement;
} {
  return { [ANALYTICS_PLACEMENT_ATTRIBUTE]: placement };
}

/** The `placement` of the nearest marked ancestor (including `element` itself), if any. */
export function placementFor(element: EventTarget | null | undefined): string | undefined {
  if (typeof Element === 'undefined' || !(element instanceof Element)) return undefined;
  const marked = element.closest(`[${ANALYTICS_PLACEMENT_ATTRIBUTE}]`);
  return marked?.getAttribute(ANALYTICS_PLACEMENT_ATTRIBUTE) || undefined;
}
