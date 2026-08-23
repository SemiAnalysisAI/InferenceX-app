import { ZH_PREFIX, type Locale } from '@/lib/i18n';
import { withChartState } from '@/lib/url-state';

/**
 * In-app href for an agentic point's detail page.
 *
 * Two things the bare `/inference/agentic/<id>` path got wrong:
 *
 *  - It dropped the `/zh` prefix, so a Chinese reader clicking a point landed
 *    on the English detail page and every link out of it kept them there.
 *  - It carried no chart state. These links are plain `<a href>` (they must
 *    support open-in-new-tab), so following one is a full-document navigation
 *    that destroys the in-memory filter store. Without the params in the URL
 *    the detail page has no way to send the reader back to the chart they
 *    left, and it opens on the default model with the default legend.
 *
 * The params are stripped from the address bar again on load (see
 * `url-state.ts`), so the detail page still shows a clean URL — they survive
 * in the in-memory store, which is what `withChartState` reads back when the
 * detail page builds its "Inference chart" link.
 */
export function agenticDetailHref(pointId: number, locale: Locale = 'en'): string {
  return withChartState(`${locale === 'zh' ? ZH_PREFIX : ''}/inference/agentic/${pointId}`);
}
