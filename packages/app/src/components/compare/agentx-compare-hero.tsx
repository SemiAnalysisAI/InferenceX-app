import { ArrowRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { MinecraftSplash } from '@/components/minecraft/minecraft-splash';
import { NewBadge } from '@/components/ui/new-badge';
import { agentxDashboardHref, FEATURED_AGENTX_MODELS } from '@/lib/compare-agentx';

import { CompareIndexTrackedLink } from './compare-index-tracked-link';

/**
 * Full-color brand marks for the ledger rows, sharing the `*-color.svg`
 * assets used by `/model` pages and inference chart captions. Keyed by
 * compare slug so a featured model without a registered mark simply renders
 * without one instead of breaking the row.
 */
const MODEL_LOGOS: Record<string, string> = {
  'kimi-k3': '/logos/kimi-color.svg',
  'deepseek-v4': '/logos/deepseek-color.svg',
  // GLM ships under the Z.ai product brand, so the ledger shows the Z.ai
  // mark rather than the Zhipu corporate dot cluster.
  'glm-5-2': '/logos/zai-color.svg',
  'minimax-m3': '/logos/minimax-color.svg',
  'qwen-3-8-flash-next': '/logos/qwen-color.svg',
  'qwen-3-5': '/logos/qwen-color.svg',
};

/**
 * Full-color marks for the hardware platforms named in the description.
 * The path data is copied from the shared brand assets under
 * `public/logos/` but inlined as SVG elements: the strip must add zero
 * `/logos/` image requests, because the mobile landing performance spec
 * budgets those fetches to the ledger's lazy `*-color.svg` model marks.
 * viewBoxes are cropped to the path content, so rendered sizes need no
 * canvas-padding compensation and the marks read optically equal.
 *
 * NVIDIA uses its official brand green (#76B900) as-is in both themes;
 * the OpenAI and AMD marks are black by brand design (neither has a
 * color variant), so they render in `currentColor` via `text-foreground`,
 * which reproduces the official reversed-white treatment in dark mode.
 */
const VENDOR_MARKS: readonly {
  name: string;
  viewBox: string;
  width: number;
  height: number;
  /** Brand color, or `currentColor` for marks that are monochrome by design. */
  fill: string;
  d: string;
}[] = [
  {
    name: 'OpenAI',
    viewBox: '0 0 256 260',
    width: 22,
    height: 22,
    fill: 'currentColor',
    d: 'M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z',
  },
  {
    name: 'AMD',
    viewBox: '-0.04 9.1 24.08 5.8',
    width: 71,
    height: 17,
    fill: 'currentColor',
    d: 'M18.324 9.137l1.559 1.56h2.556v2.557L24 14.814V9.137zM2 9.52l-2 4.96h1.309l.37-.982H3.9l.408.982h1.338L3.432 9.52zm4.209 0v4.955h1.238v-3.092l1.338 1.562h.188l1.338-1.556v3.091h1.238V9.52H10.47l-1.592 1.845L7.287 9.52zm6.283 0v4.96h2.057c1.979 0 2.88-1.046 2.88-2.472 0-1.36-.937-2.488-2.747-2.488zm1.237.91h.792c1.17 0 1.63.711 1.63 1.57 0 .728-.372 1.572-1.616 1.572h-.806zm-10.985.273l.791 1.932H2.008zm17.137.307l-1.604 1.603v2.25h2.246l1.604-1.607h-2.246z',
  },
  {
    name: 'NVIDIA',
    viewBox: '-0.02 4.03 24.04 15.94',
    width: 33,
    height: 22,
    fill: '#76B900',
    d: 'M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952a6.016 6.016 0 0 0-.796.035m0-4.735v2.138l.424-.027c5.45-.185 9.01 4.47 9.01 4.47s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097v1.325c.3.035.61.062.91.062 3.957 0 6.82-2.023 9.593-4.408.459.371 2.34 1.263 2.73 1.652-2.633 2.208-8.772 3.984-12.253 3.984-.335 0-.653-.018-.971-.053v1.864H24V4.063zm0 10.326v1.131c-3.657-.654-4.673-4.46-4.673-4.46s1.758-1.944 4.673-2.262v1.237H8.94c-1.528-.186-2.73 1.245-2.73 1.245s.68 2.412 2.739 3.11M2.456 10.9s2.164-3.197 6.5-3.533V6.201C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936z',
  },
] as const;

const STRINGS = {
  en: {
    eyebrow: 'AgentX / live results',
    title: 'Compare Realistic Agentic Inference Perf',
    description:
      'Long Context Multi Turn Inference Performance. Compare Across OpenAI Jalapeño, MI355X, GB300 NVL72, GB200 NVL72, B200, H200, H100, RTX Pro, and soon TPUv7/v8 & Rubin NVL72 & MI455X UALoE72',
    overview: 'Overview',
    dashboard: 'Full dashboard',
    ledgerTitle: 'Models with AgentX results',
    modelAction: 'View results',
    newModel: 'NEW',
  },
  zh: {
    eyebrow: 'AgentX｜最新结果',
    title: '真实智能体工作负载下的推理性能对比',
    description:
      '比较不同硬件平台在长上下文、多轮智能体工作负载下的推理性能，覆盖 OpenAI Jalapeño、MI355X、GB300 NVL72、GB200 NVL72、B200、H200、H100 和 RTX Pro，即将支持 TPUv7/v8、Rubin NVL72 与 MI455X UALoE72。',
    overview: '总览',
    dashboard: '查看完整仪表板',
    ledgerTitle: '已发布 AgentX 结果的模型',
    modelAction: '查看结果',
    newModel: '新',
  },
} as const;

/**
 * The hero leads `/compare` and the landing page. `/compare` owns the page
 * `h1`; the landing page renders the hero under its own section flow, so the
 * caller picks the heading level rather than shipping a second `h1`.
 */
export function AgentXCompareHero({
  locale,
  headingLevel = 'h1',
  surface = 'compare',
}: {
  locale: 'en' | 'zh';
  headingLevel?: 'h1' | 'h2';
  surface?: 'compare' | 'landing';
}) {
  const t = STRINGS[locale];
  const prefix = locale === 'zh' ? '/zh' : '';
  const Heading = headingLevel;

  return (
    <section data-testid="compare-agentx-primary">
      <Card className="overflow-hidden p-0 md:p-0">
        <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
          <div className="flex flex-col justify-center px-6 py-5 md:px-8 md:py-6 lg:px-10 lg:py-7">
            <p className="font-mono text-xs font-semibold tracking-eyebrow text-brand uppercase">
              {t.eyebrow}
            </p>
            {/* `relative` anchors the splash, which positions itself absolutely
                at the top right. Landing only: /compare is not the launch
                surface, and the announcement belongs on the front page. */}
            <div className="relative">
              <Heading className="mt-3 max-w-2xl text-2xl/[1.8rem] font-semibold tracking-tight text-foreground lg:text-[2.4rem]/[2.4rem]">
                {t.title}
              </Heading>
              {surface === 'landing' && <MinecraftSplash />}
            </div>
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground lg:text-lg">
              {t.description}
            </p>
            {/* Decorative: the description right above already names every
                vendor, so the strip is hidden from assistive technology. */}
            <div
              aria-hidden="true"
              data-testid="compare-agentx-vendor-marks"
              className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-foreground"
            >
              {VENDOR_MARKS.map((mark) => (
                <svg
                  key={mark.name}
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox={mark.viewBox}
                  width={mark.width}
                  height={mark.height}
                  fill={mark.fill}
                  className="shrink-0"
                >
                  <path d={mark.d} />
                </svg>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <CompareIndexTrackedLink
                data-testid="compare-agentx-overview-link"
                href={`${prefix}/overview`}
                analyticsEvent="compare_agentx_overview_clicked"
                analyticsSurface={surface}
                appNavigation
                className="group motion-press inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-5 py-2.5 font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-brand/90"
              >
                {t.overview}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-0.5"
                />
              </CompareIndexTrackedLink>
              <CompareIndexTrackedLink
                data-testid="compare-agentx-dashboard-link"
                href={agentxDashboardHref(locale, FEATURED_AGENTX_MODELS[0])}
                analyticsEvent="compare_agentx_dashboard_clicked"
                analyticsTarget="kimi-k3"
                analyticsSurface={surface}
                appNavigation
                className="group motion-press inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-5 py-2.5 font-semibold text-foreground transition-colors hover:bg-muted"
              >
                {t.dashboard}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-0.5"
                />
              </CompareIndexTrackedLink>
            </div>
          </div>

          <div className="border-t border-border/70 bg-muted/15 lg:border-t-0 lg:border-l">
            {/* The visible ledger header is dropped; `ledgerTitle` stays as the
                nav's accessible name so screen readers still get the label. */}
            <nav aria-label={t.ledgerTitle} className="divide-y divide-border/70">
              {FEATURED_AGENTX_MODELS.map((model) => (
                <CompareIndexTrackedLink
                  key={model.slug}
                  data-testid={`compare-agentx-model-${model.slug}`}
                  href={agentxDashboardHref(locale, model)}
                  analyticsEvent="compare_agentx_model_clicked"
                  analyticsTarget={model.slug}
                  analyticsSurface={surface}
                  appNavigation
                  className="group flex min-h-14 items-center justify-between gap-4 px-5 py-2.5 transition-colors hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {MODEL_LOGOS[model.slug] && (
                      <img
                        src={MODEL_LOGOS[model.slug]}
                        alt=""
                        aria-hidden="true"
                        width={32}
                        height={32}
                        loading="lazy"
                        className="size-8 shrink-0 object-contain"
                      />
                    )}
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight text-foreground group-hover:text-brand">
                        <span className="min-w-0">{model.label}</span>
                        <NewBadge data-new-badge="agentx-ledger">{t.newModel}</NewBadge>
                      </span>
                      <span className="mt-1 block font-mono text-3xs tracking-eyebrow text-brand uppercase">
                        AgentX
                      </span>
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                    {t.modelAction}
                    <ArrowRight
                      aria-hidden="true"
                      className="size-3.5 motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-0.5"
                    />
                  </span>
                </CompareIndexTrackedLink>
              ))}
            </nav>
          </div>
        </div>
      </Card>
    </section>
  );
}
