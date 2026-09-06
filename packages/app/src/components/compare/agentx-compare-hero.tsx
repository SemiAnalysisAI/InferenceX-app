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
  'glm-5-3': '/logos/zai-color.svg',
  'minimax-m3': '/logos/minimax-color.svg',
  'qwen-3-8-flash-next': '/logos/qwen-color.svg',
  'qwen-3-5': '/logos/qwen-color.svg',
};

/**
 * Full-color brand marks for the hero strip: the silicon platforms named
 * in the description (OpenAI, AMD, NVIDIA) followed by Meta, Microsoft,
 * and Oracle. The path data is copied from the shared brand assets under
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
 * Meta keeps the official blue-gradient fills from `meta-color.svg`
 * (gradient ids re-namespaced `agentx-meta-*` since inline defs land in
 * the page DOM), Microsoft its four-color window, and Oracle renders in
 * Oracle Red #C74634 (PMS 180 C per Oracle's brand guidelines — the
 * shared `oracle.svg` asset carries no fill of its own).
 */
interface VendorMarkGradient {
  id: string;
  x1: string;
  y1: string;
  x2: string;
  y2: string;
  stops: readonly { offset: string; color: string }[];
}

const VENDOR_MARKS: readonly {
  name: string;
  viewBox: string;
  width: number;
  height: number;
  /** Linear gradients referenced by path fills; ids are namespaced to avoid DOM collisions. */
  gradients?: readonly VendorMarkGradient[];
  /** Brand-color fills, or `currentColor` for marks that are monochrome by design. */
  paths: readonly { d: string; fill: string }[];
}[] = [
  {
    name: 'OpenAI',
    viewBox: '0 0 256 260',
    width: 22,
    height: 22,
    paths: [
      {
        d: 'M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z',
        fill: 'currentColor',
      },
    ],
  },
  {
    name: 'AMD',
    viewBox: '-0.04 9.1 24.08 5.8',
    width: 71,
    height: 17,
    paths: [
      {
        d: 'M18.324 9.137l1.559 1.56h2.556v2.557L24 14.814V9.137zM2 9.52l-2 4.96h1.309l.37-.982H3.9l.408.982h1.338L3.432 9.52zm4.209 0v4.955h1.238v-3.092l1.338 1.562h.188l1.338-1.556v3.091h1.238V9.52H10.47l-1.592 1.845L7.287 9.52zm6.283 0v4.96h2.057c1.979 0 2.88-1.046 2.88-2.472 0-1.36-.937-2.488-2.747-2.488zm1.237.91h.792c1.17 0 1.63.711 1.63 1.57 0 .728-.372 1.572-1.616 1.572h-.806zm-10.985.273l.791 1.932H2.008zm17.137.307l-1.604 1.603v2.25h2.246l1.604-1.607h-2.246z',
        fill: 'currentColor',
      },
    ],
  },
  {
    name: 'NVIDIA',
    viewBox: '-0.02 4.03 24.04 15.94',
    width: 33,
    height: 22,
    paths: [
      {
        d: 'M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952a6.016 6.016 0 0 0-.796.035m0-4.735v2.138l.424-.027c5.45-.185 9.01 4.47 9.01 4.47s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097v1.325c.3.035.61.062.91.062 3.957 0 6.82-2.023 9.593-4.408.459.371 2.34 1.263 2.73 1.652-2.633 2.208-8.772 3.984-12.253 3.984-.335 0-.653-.018-.971-.053v1.864H24V4.063zm0 10.326v1.131c-3.657-.654-4.673-4.46-4.673-4.46s1.758-1.944 4.673-2.262v1.237H8.94c-1.528-.186-2.73 1.245-2.73 1.245s.68 2.412 2.739 3.11M2.456 10.9s2.164-3.197 6.5-3.533V6.201C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936z',
        fill: '#76B900',
      },
    ],
  },
  {
    name: 'Meta',
    viewBox: '0 3.99 24 16.02',
    width: 30,
    height: 20,
    gradients: [
      {
        id: 'agentx-meta-0',
        x1: '75.897%',
        y1: '89.199%',
        x2: '26.312%',
        y2: '12.194%',
        stops: [
          { offset: '.06%', color: '#0867DF' },
          { offset: '45.39%', color: '#0668E1' },
          { offset: '85.91%', color: '#0064E0' },
        ],
      },
      {
        id: 'agentx-meta-1',
        x1: '21.67%',
        y1: '75.874%',
        x2: '97.068%',
        y2: '23.985%',
        stops: [
          { offset: '13.23%', color: '#0064DF' },
          { offset: '99.88%', color: '#0064E0' },
        ],
      },
      {
        id: 'agentx-meta-2',
        x1: '38.263%',
        y1: '89.127%',
        x2: '60.895%',
        y2: '16.131%',
        stops: [
          { offset: '1.47%', color: '#0072EC' },
          { offset: '68.81%', color: '#0064DF' },
        ],
      },
      {
        id: 'agentx-meta-3',
        x1: '47.032%',
        y1: '90.19%',
        x2: '52.15%',
        y2: '15.745%',
        stops: [
          { offset: '7.31%', color: '#007CF6' },
          { offset: '99.43%', color: '#0072EC' },
        ],
      },
      {
        id: 'agentx-meta-4',
        x1: '52.155%',
        y1: '58.301%',
        x2: '47.591%',
        y2: '37.004%',
        stops: [
          { offset: '7.31%', color: '#007FF9' },
          { offset: '100%', color: '#007CF6' },
        ],
      },
      {
        id: 'agentx-meta-5',
        x1: '37.689%',
        y1: '12.502%',
        x2: '61.961%',
        y2: '63.624%',
        stops: [
          { offset: '7.31%', color: '#007FF9' },
          { offset: '100%', color: '#0082FB' },
        ],
      },
      {
        id: 'agentx-meta-6',
        x1: '34.808%',
        y1: '68.859%',
        x2: '62.313%',
        y2: '23.174%',
        stops: [
          { offset: '27.99%', color: '#007FF8' },
          { offset: '91.41%', color: '#0082FB' },
        ],
      },
      {
        id: 'agentx-meta-7',
        x1: '43.762%',
        y1: '6.235%',
        x2: '57.602%',
        y2: '98.514%',
        stops: [
          { offset: '0%', color: '#0082FB' },
          { offset: '99.95%', color: '#0081FA' },
        ],
      },
      {
        id: 'agentx-meta-8',
        x1: '60.055%',
        y1: '4.661%',
        x2: '39.88%',
        y2: '69.077%',
        stops: [
          { offset: '6.19%', color: '#0081FA' },
          { offset: '100%', color: '#0080F9' },
        ],
      },
      {
        id: 'agentx-meta-9',
        x1: '30.282%',
        y1: '59.32%',
        x2: '61.081%',
        y2: '33.244%',
        stops: [
          { offset: '0%', color: '#027AF3' },
          { offset: '100%', color: '#0080F9' },
        ],
      },
      {
        id: 'agentx-meta-10',
        x1: '20.433%',
        y1: '50.001%',
        x2: '82.112%',
        y2: '50.001%',
        stops: [
          { offset: '0%', color: '#0377EF' },
          { offset: '99.94%', color: '#0279F1' },
        ],
      },
      {
        id: 'agentx-meta-11',
        x1: '40.303%',
        y1: '35.298%',
        x2: '72.394%',
        y2: '57.811%',
        stops: [
          { offset: '.19%', color: '#0471E9' },
          { offset: '100%', color: '#0377EF' },
        ],
      },
      {
        id: 'agentx-meta-12',
        x1: '32.254%',
        y1: '19.719%',
        x2: '68.003%',
        y2: '84.908%',
        stops: [
          { offset: '27.65%', color: '#0867DF' },
          { offset: '100%', color: '#0471E9' },
        ],
      },
    ],
    paths: [
      {
        d: 'M6.897 4h-.024l-.031 2.615h.022c1.715 0 3.046 1.357 5.94 6.246l.175.297.012.02 1.62-2.438-.012-.019a48.763 48.763 0 00-1.098-1.716 28.01 28.01 0 00-1.175-1.629C10.413 4.932 8.812 4 6.896 4z',
        fill: 'url(#agentx-meta-0)',
      },
      {
        d: 'M6.873 4C4.95 4.01 3.247 5.258 2.02 7.17a4.352 4.352 0 00-.01.017l2.254 1.231.011-.017c.718-1.083 1.61-1.774 2.568-1.785h.021L6.896 4h-.023z',
        fill: 'url(#agentx-meta-1)',
      },
      {
        d: 'M2.019 7.17l-.011.017C1.2 8.447.598 9.995.274 11.664l-.005.022 2.534.6.004-.022c.27-1.467.786-2.828 1.456-3.845l.011-.017L2.02 7.17z',
        fill: 'url(#agentx-meta-2)',
      },
      {
        d: 'M2.807 12.264l-2.533-.6-.005.022c-.177.918-.267 1.851-.269 2.786v.023l2.598.233v-.023a12.591 12.591 0 01.21-2.44z',
        fill: 'url(#agentx-meta-3)',
      },
      {
        d: 'M2.677 15.537a5.462 5.462 0 01-.079-.813v-.022L0 14.468v.024a8.89 8.89 0 00.146 1.652l2.535-.585a4.106 4.106 0 01-.004-.022z',
        fill: 'url(#agentx-meta-4)',
      },
      {
        d: 'M3.27 16.89c-.284-.31-.484-.756-.589-1.328l-.004-.021-2.535.585.004.021c.192 1.01.568 1.85 1.106 2.487l.014.017 2.018-1.745a2.106 2.106 0 01-.015-.016z',
        fill: 'url(#agentx-meta-5)',
      },
      {
        d: 'M10.78 9.654c-1.528 2.35-2.454 3.825-2.454 3.825-2.035 3.2-2.739 3.917-3.871 3.917a1.545 1.545 0 01-1.186-.508l-2.017 1.744.014.017C2.01 19.518 3.058 20 4.356 20c1.963 0 3.374-.928 5.884-5.33l1.766-3.13a41.283 41.283 0 00-1.227-1.886z',
        fill: '#0082FB',
      },
      {
        d: 'M13.502 5.946l-.016.016c-.4.43-.786.908-1.16 1.416.378.483.768 1.024 1.175 1.63.48-.743.928-1.345 1.367-1.807l.016-.016-1.382-1.24z',
        fill: 'url(#agentx-meta-6)',
      },
      {
        d: 'M20.918 5.713C19.853 4.633 18.583 4 17.225 4c-1.432 0-2.637.787-3.723 1.944l-.016.016 1.382 1.24.016-.017c.715-.747 1.408-1.12 2.176-1.12.826 0 1.6.39 2.27 1.075l.015.016 1.589-1.425-.016-.016z',
        fill: '#0082FB',
      },
      {
        d: 'M23.998 14.125c-.06-3.467-1.27-6.566-3.064-8.396l-.016-.016-1.588 1.424.015.016c1.35 1.392 2.277 3.98 2.361 6.971v.023h2.292v-.022z',
        fill: 'url(#agentx-meta-7)',
      },
      {
        d: 'M23.998 14.15v-.023h-2.292v.022c.004.14.006.282.006.424 0 .815-.121 1.474-.368 1.95l-.011.022 1.708 1.782.013-.02c.62-.96.946-2.293.946-3.91 0-.083 0-.165-.002-.247z',
        fill: 'url(#agentx-meta-8)',
      },
      {
        d: 'M21.344 16.52l-.011.02c-.214.402-.519.67-.917.787l.778 2.462a3.493 3.493 0 00.438-.182 3.558 3.558 0 001.366-1.218l.044-.065.012-.02-1.71-1.784z',
        fill: 'url(#agentx-meta-9)',
      },
      {
        d: 'M19.92 17.393c-.262 0-.492-.039-.718-.14l-.798 2.522c.449.153.927.222 1.46.222.492 0 .943-.073 1.352-.215l-.78-2.462c-.167.05-.341.075-.517.073z',
        fill: 'url(#agentx-meta-10)',
      },
      {
        d: 'M18.323 16.534l-.014-.017-1.836 1.914.016.017c.637.682 1.246 1.105 1.937 1.337l.797-2.52c-.291-.125-.573-.353-.9-.731z',
        fill: 'url(#agentx-meta-11)',
      },
      {
        d: 'M18.309 16.515c-.55-.642-1.232-1.712-2.303-3.44l-1.396-2.336-.011-.02-1.62 2.438.012.02.989 1.668c.959 1.61 1.74 2.774 2.493 3.585l.016.016 1.834-1.914a2.353 2.353 0 01-.014-.017z',
        fill: 'url(#agentx-meta-12)',
      },
    ],
  },
  {
    name: 'Microsoft',
    viewBox: '0 0 256 256',
    width: 20,
    height: 20,
    paths: [
      { d: 'M121.666 121.666H0V0h121.666z', fill: '#F1511B' },
      { d: 'M256 121.666H134.335V0H256z', fill: '#80CC28' },
      { d: 'M121.663 256.002H0V134.336h121.663z', fill: '#00ADEF' },
      { d: 'M256 256.002H134.335V134.336H256z', fill: '#FBBC09' },
    ],
  },
  {
    name: 'Oracle',
    viewBox: '0 0 231 30',
    width: 108,
    height: 14,
    paths: [
      {
        d: 'M99.61,19.52h15.24l-8.05-13L92,30H85.27l18-28.17a4.29,4.29,0,0,1,7-.05L128.32,30h-6.73l-3.17-5.25H103l-3.36-5.23m69.93,5.23V0.28h-5.72V27.16a2.76,2.76,0,0,0,.85,2,2.89,2.89,0,0,0,2.08.87h26l3.39-5.25H169.54M75,20.38A10,10,0,0,0,75,.28H50V30h5.71V5.54H74.65a4.81,4.81,0,0,1,0,9.62H58.54L75.6,30h8.29L72.43,20.38H75M14.88,30H32.15a14.86,14.86,0,0,0,0-29.71H14.88a14.86,14.86,0,1,0,0,29.71m16.88-5.23H15.26a9.62,9.62,0,0,1,0-19.23h16.5a9.62,9.62,0,1,1,0,19.23M140.25,30h17.63l3.34-5.23H140.64a9.62,9.62,0,1,1,0-19.23h16.75l3.38-5.25H140.25a14.86,14.86,0,1,0,0,29.71m69.87-5.23a9.62,9.62,0,0,1-9.26-7h24.42l3.36-5.24H200.86a9.61,9.61,0,0,1,9.26-7h16.76l3.35-5.25h-20.5a14.86,14.86,0,0,0,0,29.71h17.63l3.35-5.23h-20.6',
        fill: '#C74634',
      },
    ],
  },
] as const;

const STRINGS = {
  en: {
    eyebrow: 'AgentX / live results',
    title: 'Compare Realistic Agentic Inference Perf',
    description:
      'Long Context Multi Turn Inference Performance. Compare Across OpenAI Jalapeño, MI355X, GB300 NVL72, GB200 NVL72, B200, H200, H100, RTX Pro, and soon TPUv7/v8 & Rubin NVL72 & MI455X UALoE72',
    revenueCalculator: 'Token Revenue Calculator',
    dashboard: 'Dashboard',
    ledgerTitle: 'Models with AgentX results',
    modelAction: 'View results',
    newModel: 'NEW',
  },
  zh: {
    eyebrow: 'AgentX｜最新结果',
    title: '真实智能体工作负载下的推理性能对比',
    description:
      '比较不同硬件平台在长上下文、多轮智能体工作负载下的推理性能，覆盖 OpenAI Jalapeño、MI355X、GB300 NVL72、GB200 NVL72、B200、H200、H100 和 RTX Pro，即将支持 TPUv7/v8、Rubin NVL72 与 MI455X UALoE72。',
    revenueCalculator: 'Token 收入计算器',
    dashboard: '仪表板',
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
                  className="shrink-0"
                >
                  {mark.gradients ? (
                    <defs>
                      {mark.gradients.map((gradient) => (
                        <linearGradient
                          key={gradient.id}
                          id={gradient.id}
                          x1={gradient.x1}
                          y1={gradient.y1}
                          x2={gradient.x2}
                          y2={gradient.y2}
                        >
                          {gradient.stops.map((stop) => (
                            <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
                          ))}
                        </linearGradient>
                      ))}
                    </defs>
                  ) : null}
                  {mark.paths.map((path) => (
                    <path key={path.d} d={path.d} fill={path.fill} />
                  ))}
                </svg>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <CompareIndexTrackedLink
                data-testid="compare-agentx-revenue-calculator-link"
                href={`${prefix}/profit-estimator-per-gigawatt`}
                analyticsEvent="compare_agentx_revenue_calculator_clicked"
                analyticsSurface={surface}
                appNavigation
                className="group motion-press inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-5 py-2.5 font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-brand/90"
              >
                {t.revenueCalculator}
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
                  className="group flex min-h-14 items-center justify-between gap-4 px-5 py-2.5 transition-colors hover:bg-brand/5 focus-visible:outline-none"
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
