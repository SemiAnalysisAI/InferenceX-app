/**
 * Marks a page region for analytics. Click events read the nearest ancestor's value as `placement`
 * (for example `header_desktop`, `footer`, `blog_article`), so one event name can be split by where
 * the user clicked it.
 */
export const ANALYTICS_PLACEMENT_ATTRIBUTE = 'data-analytics-placement';

export type AnalyticsPlacement =
  | 'header_desktop'
  | 'header_mobile'
  | 'footer'
  | 'landing_hero'
  | 'landing'
  | 'blog_article'
  | 'glossary'
  | 'compare';

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
