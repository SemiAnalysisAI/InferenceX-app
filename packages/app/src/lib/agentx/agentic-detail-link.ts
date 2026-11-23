import { ZH_PREFIX, type Locale } from '@/lib/i18n/i18n';
import { withChartState } from '@/lib/routing/url-state';
import { getDashboardRoute } from '@/lib/routing/dashboard-routes';
import { inferenceModelForPathname } from '@/lib/routing/inference-model-slug';

export function agenticDetailHref(pointId: number, locale: Locale = 'en'): string {
  const href = withChartState(
    `${locale === 'zh' ? ZH_PREFIX : ''}${getDashboardRoute('inference').path}/agentic/${pointId}`,
  );
  // On a model route the chart state leaves the model to the path. The detail page needs it in
  // its own URL so Back can return to this chart before (or without) loading the point's data.
  const routeModel =
    typeof window === 'undefined' ? null : inferenceModelForPathname(window.location.pathname);
  if (!routeModel || /[?&]g_model=/u.test(href)) return href;
  const param = `g_model=${encodeURIComponent(routeModel)}`;
  return `${href}${href.includes('?') ? '&' : '?'}${param}`;
}
