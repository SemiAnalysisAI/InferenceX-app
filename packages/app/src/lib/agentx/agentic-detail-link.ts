import { ZH_PREFIX, type Locale } from '@/lib/i18n/i18n';
import { withChartState } from '@/lib/routing/url-state';
import { getDashboardRoute } from '@/lib/routing/dashboard-routes';

export function agenticDetailHref(pointId: number, locale: Locale = 'en'): string {
  return withChartState(
    `${locale === 'zh' ? ZH_PREFIX : ''}${getDashboardRoute('inference').path}/agentic/${pointId}`,
  );
}
