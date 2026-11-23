import { ZH_PREFIX, type Locale } from '@/lib/i18n/i18n';
import { withChartState } from '@/lib/routing/url-state';
import { getDashboardRoute } from '@/lib/routing/dashboard-routes';

/**
 * The agentic detail page of a stored point. It names the point's own model in `g_model`, so the
 * detail page knows which chart Back returns to before any point data loads. The model comes from
 * the point, not the current URL, so server and client render the same model.
 */
export function agenticDetailHref(
  pointId: number,
  model: string | undefined,
  locale: Locale = 'en',
): string {
  const href = withChartState(
    `${locale === 'zh' ? ZH_PREFIX : ''}${getDashboardRoute('inference').path}/agentic/${pointId}`,
  );
  if (!model) return href;
  const [path, search = ''] = href.split('?');
  const params = new URLSearchParams(search);
  params.set('g_model', model);
  return `${path}?${params}`;
}
