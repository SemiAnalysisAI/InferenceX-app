'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ChartButtons, ExpandChartButton } from '@/components/ui/chart-buttons';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { useDialogCloseTracking } from '@/lib/analytics/use-dialog-close-tracking';

const STRINGS = {
  en: {
    expandChart: 'Expand chart',
    zoomInstructions: 'scroll to zoom · drag to pan · double-click to reset',
  },
  zh: {
    expandChart: '展开图表',
    zoomInstructions: '滚轮缩放 · 拖动平移 · 双击重置',
  },
} as const;

function useChartId() {
  return `awe-${useId().replaceAll(/[^a-zA-Z0-9_-]/gu, '')}`;
}

const ChartIdContext = createContext<string | null>(null);

function ChartExportFrame({
  chartId,
  title,
  children,
}: {
  chartId: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <ChartIdContext.Provider value={chartId}>
      <div id={chartId} className="min-w-0">
        <div className="export-only mb-2 hidden text-sm font-medium text-foreground">{title}</div>
        {children}
        <div className="max-h-0 overflow-hidden" aria-hidden="true">
          <div id={`${chartId}-export`} className="p-4" />
        </div>
      </div>
    </ChartIdContext.Provider>
  );
}

const CHART_SVG = 'svg:not(.lucide)[viewBox]';
const MAX_ZOOM = 20;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function readBox(svg: SVGSVGElement, attr = 'viewBox'): Box | null {
  const parts = svg
    .getAttribute(attr)
    ?.split(/[\s,]+/u)
    .map(Number);
  if (!parts || parts.length !== 4 || parts.some(Number.isNaN)) return null;
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

function setScale(svg: SVGSVGElement) {
  const box = readBox(svg);
  const rect = svg.getBoundingClientRect();
  if (!box || rect.width === 0) return;
  const k = Math.min(rect.width / box.w, rect.height / box.h);
  svg.style.setProperty('--k', String(Math.max(1, k)));
}

function ChartZoom({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = STRINGS[useLocale()];

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const rescale = () => root.querySelectorAll<SVGSVGElement>(CHART_SVG).forEach(setScale);
    const resize = new ResizeObserver(rescale);
    resize.observe(root);
    const mutations = new MutationObserver(rescale);
    mutations.observe(root, { childList: true, subtree: true });
    rescale();

    const target = (e: Event) =>
      e.target instanceof Element ? e.target.closest<SVGSVGElement>(CHART_SVG) : null;
    const original = (svg: SVGSVGElement) => {
      if (!svg.dataset.vb0) svg.dataset.vb0 = svg.getAttribute('viewBox') ?? '';
      return readBox(svg, 'data-vb0');
    };
    const apply = (svg: SVGSVGElement, b: Box, o: Box) => {
      b.x = Math.min(Math.max(b.x, o.x), o.x + o.w - b.w);
      b.y = Math.min(Math.max(b.y, o.y), o.y + o.h - b.h);
      svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
      svg.style.cursor = b.w < o.w ? 'grab' : '';
      setScale(svg);
    };

    const onWheel = (e: WheelEvent) => {
      const svg = target(e);
      const o = svg && original(svg);
      const b = svg && readBox(svg);
      const ctm = svg?.getScreenCTM();
      if (!svg || !o || !b || !ctm) return;
      e.preventDefault();
      const w = Math.min(o.w, Math.max(o.w / MAX_ZOOM, b.w * Math.exp(e.deltaY * 0.0015)));
      const f = w / b.w;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      apply(svg, { x: p.x - (p.x - b.x) * f, y: p.y - (p.y - b.y) * f, w, h: b.h * f }, o);
    };

    let drag: { svg: SVGSVGElement; x: number; y: number; moved: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      const svg = target(e);
      const o = svg && original(svg);
      const b = svg && readBox(svg);
      if (svg && o && b && b.w < o.w) drag = { svg, x: e.clientX, y: e.clientY, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const { svg } = drag;
      const o = original(svg);
      const b = readBox(svg);
      const ctm = svg.getScreenCTM();
      if (!o || !b || !ctm) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      drag = { svg, x: e.clientX, y: e.clientY, moved: true };
      svg.style.cursor = 'grabbing';
      apply(svg, { ...b, x: b.x - dx / ctm.a, y: b.y - dy / ctm.d }, o);
    };
    const onUp = (e: PointerEvent) => {
      if (drag?.moved)
        e.target?.addEventListener('click', (c) => c.stopPropagation(), {
          once: true,
          capture: true,
        });
      if (drag) drag.svg.style.cursor = 'grab';
      drag = null;
    };
    const onDoubleClick = (e: MouseEvent) => {
      const svg = target(e);
      const o = svg && original(svg);
      if (svg && o) apply(svg, { ...o }, o);
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    root.addEventListener('dblclick', onDoubleClick);
    return () => {
      resize.disconnect();
      mutations.disconnect();
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      root.removeEventListener('dblclick', onDoubleClick);
    };
  }, []);

  return (
    <div ref={ref} className="chart-zoom w-full min-w-0">
      {children}
      <p className="mt-2 text-right text-3xs font-mono text-muted-foreground">
        {t.zoomInstructions}
      </p>
    </div>
  );
}

function ChartDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  actions,
  sharedZoom = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  sharedZoom?: boolean;
}) {
  const t = STRINGS[useLocale()];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[60] max-h-[92vh] w-[min(96vw,1400px)] max-w-none gap-4 overflow-y-auto p-6"
        overlayClassName="z-[60]"
      >
        <div className="flex items-start justify-between gap-2 pr-8">
          <div className="min-w-0">
            <DialogTitle className="text-lg font-medium leading-none">{title}</DialogTitle>
            {subtitle && (
              // Subtitles can carry legend rows (divs), which are invalid inside the default <p>.
              <DialogDescription asChild className="mt-1.5 text-xs text-muted-foreground">
                <div>{subtitle}</div>
              </DialogDescription>
            )}
            {!title && <DialogTitle className="sr-only">{t.expandChart}</DialogTitle>}
          </div>
          {actions}
        </div>
        {sharedZoom ? children : <ChartZoom>{children}</ChartZoom>}
      </DialogContent>
    </Dialog>
  );
}

export function ExpandableChart({
  title,
  subtitle,
  children,
  actions,
  sharedZoom = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode | ((expanded: boolean, close: () => void) => ReactNode);
  /** `ChartActions` for the header row, next to the title. */
  actions?: ReactNode;
  sharedZoom?: boolean;
}) {
  const chartId = useChartId();
  const [open, setOpen] = useState(false);
  useDialogCloseTracking(open, 'agentic_workload_chart_closed');
  const [bodyHeight, setBodyHeight] = useState<number>();
  const [inlineTriggers, setInlineTriggers] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const isRender = typeof children === 'function';
  const close = () => setOpen(false);
  const render = (expanded: boolean) => (isRender ? children(expanded, close) : children);
  const expand = useCallback(() => {
    setBodyHeight(bodyRef.current?.offsetHeight);
    setOpen(true);
    track('agentic_workload_chart_expanded');
  }, []);
  // Chart actions inside the body bring their own expand icon, so the header
  // button steps aside and expand + download sit together at the right edge.
  const register = useCallback(() => {
    setInlineTriggers((n) => n + 1);
    return () => setInlineTriggers((n) => n - 1);
  }, []);
  const titleText = typeof title === 'string' ? title : undefined;
  const expandContext = useMemo(
    () => ({ open: expand, register, title: titleText }),
    [expand, register, titleText],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm">{title}</CardTitle>
            {subtitle && <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>}
          </div>
          {actions !== undefined && (
            <ExpandContext.Provider value={expandContext}>
              <ChartIdContext.Provider value={chartId}>{actions}</ChartIdContext.Provider>
            </ExpandContext.Provider>
          )}
          {inlineTriggers === 0 && (
            <div className="-my-1 -mr-1">
              <ExpandChartButton onClick={expand} chartTitle={titleText} />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent ref={bodyRef} style={open && !isRender ? { minHeight: bodyHeight } : undefined}>
        <ExpandContext.Provider value={expandContext}>
          <ChartExportFrame chartId={chartId} title={title}>
            {(isRender || !open) && render(false)}
          </ChartExportFrame>
        </ExpandContext.Provider>
      </CardContent>
      <ChartDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        subtitle={subtitle}
        sharedZoom={sharedZoom}
        actions={
          actions !== undefined && (
            <ExpandContext.Provider value={null}>
              <ChartIdContext.Provider value={`${chartId}-expanded`}>
                {actions}
              </ChartIdContext.Provider>
            </ExpandContext.Provider>
          )
        }
      >
        {open && (
          <ExpandContext.Provider value={null}>
            <ChartExportFrame chartId={`${chartId}-expanded`} title={title}>
              <div className={isRender ? undefined : '[&_svg]:!max-h-[calc(92vh-180px)]'}>
                {render(true)}
              </div>
            </ChartExportFrame>
          </ExpandContext.Provider>
        )}
      </ChartDialog>
    </Card>
  );
}

interface ExpandContextValue {
  open: () => void;
  /** Called by an inline ExpandTrigger so the owner can hide its own expand button. */
  register?: () => () => void;
  title?: string;
}

const ExpandContext = createContext<ExpandContextValue | null>(null);

export function Expandable({
  title,
  subtitle,
  corner = false,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  corner?: boolean;
  children: ReactNode;
}) {
  const chartId = useChartId();
  const [open, setOpen] = useState(false);
  useDialogCloseTracking(open, 'agentic_workload_chart_closed');
  const [generation, setGeneration] = useState(0);
  const titleText = typeof title === 'string' ? title : undefined;
  const expandContext = useMemo(
    () => ({
      open: () => {
        setOpen(true);
        track('agentic_workload_chart_expanded');
      },
      title: titleText,
    }),
    [titleText],
  );
  return (
    <ExpandContext.Provider value={expandContext}>
      <ChartExportFrame key={generation} chartId={chartId} title={title}>
        {corner ? (
          <div className="relative">
            {children}
            <div className="absolute right-4 top-4 md:right-6 md:top-6">
              <ExpandTrigger />
            </div>
          </div>
        ) : (
          children
        )}
      </ChartExportFrame>
      <ChartDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setGeneration((g) => g + 1);
        }}
        title={title}
        subtitle={subtitle}
      >
        {open && (
          <ExpandContext.Provider value={null}>
            <ChartExportFrame chartId={`${chartId}-expanded`} title={title}>
              <div className="mx-auto w-full max-w-[1100px] [&_svg:not(.lucide)]:!max-h-[70vh]">
                {children}
              </div>
            </ChartExportFrame>
          </ExpandContext.Provider>
        )}
      </ChartDialog>
    </ExpandContext.Provider>
  );
}

export function ExpandTrigger() {
  const context = useContext(ExpandContext);
  const register = context?.register;
  useLayoutEffect(() => register?.(), [register]);
  return context ? <ExpandChartButton onClick={context.open} chartTitle={context.title} /> : null;
}

/** Expand and download buttons for an explorer chart inside `Expandable` or `ExpandableChart`. */
export function ChartActions({
  fileName,
  onExportPng,
}: {
  fileName: string;
  /** Fires the chart's own analytics event when a PNG export starts. */
  onExportPng?: () => void;
}) {
  const chartId = useContext(ChartIdContext);
  const expand = useContext(ExpandContext);
  if (!chartId) return null;
  return (
    <ChartButtons
      chartId={chartId}
      exportFileName={fileName}
      hideZoomReset
      onExportPng={onExportPng}
      leadingControls={expand ? <ExpandTrigger /> : undefined}
      className="mb-0 ml-auto"
    />
  );
}

/** A chart's small label with its actions on the same row. The dialog title replaces the label. */
export function ChartLabelRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  const inline = useContext(ExpandContext) !== null;
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      {inline && (
        <div className="no-export min-w-0 text-xs font-medium text-muted-foreground">{label}</div>
      )}
      {children}
    </div>
  );
}
