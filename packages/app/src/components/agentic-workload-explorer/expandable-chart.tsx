'use client';

import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';

const STRINGS = {
  en: {
    expandChart: 'Expand chart',
    close: 'Close',
    zoomInstructions: 'scroll to zoom · drag to pan · double-click to reset',
  },
  zh: {
    expandChart: '展开图表',
    close: '关闭',
    zoomInstructions: '滚轮缩放 · 拖动平移 · 双击重置',
  },
} as const;

export function ExpandButton({ onClick }: { onClick: () => void }) {
  const t = STRINGS[useLocale()];
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground transition-colors"
      aria-label={t.expandChart}
    >
      <Maximize2 className="size-4" />
    </button>
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

/** Screen px per SVG unit (never below 1, so small screens don't enlarge text). */
function setScale(svg: SVGSVGElement) {
  const box = readBox(svg);
  const rect = svg.getBoundingClientRect();
  if (!box || rect.width === 0) return;
  const k = Math.min(rect.width / box.w, rect.height / box.h);
  svg.style.setProperty('--k', String(Math.max(1, k)));
}

/**
 * Chart dialog body: keeps SVG text and strokes at their drawn size (see
 * .chart-zoom in globals.css) and lets every chart zoom with the wheel, pan by
 * dragging, and reset with a double-click, by rewriting the SVG's viewBox.
 */
function ChartZoom({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = STRINGS[useLocale()];

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const rescale = () => root.querySelectorAll<SVGSVGElement>(CHART_SVG).forEach(setScale);
    const resize = new ResizeObserver(rescale);
    resize.observe(root);
    // Charts can swap SVGs inside the dialog (toggles, data loading).
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
      // Keep the point under the cursor fixed.
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
      // A drag shouldn't also click the bar under the pointer.
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
      <p className="mt-2 text-right text-3xs font-mono text-subtle">{t.zoomInstructions}</p>
    </div>
  );
}

/** Large centered dialog for an expanded chart. */
export function ChartDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const t = STRINGS[useLocale()];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] w-[min(96vw,1400px)] max-w-none gap-4 overflow-y-auto p-6"
        overlayClassName="z-[60]"
      >
        <div className="pr-8">
          <DialogTitle className="text-lg font-semibold leading-none tracking-tight">
            {title}
          </DialogTitle>
          {subtitle && (
            <DialogDescription className="mt-1.5 text-xs text-muted-foreground">
              {subtitle}
            </DialogDescription>
          )}
          {/* Ensure an accessible title is always present, even if title is non-text */}
          {!title && <DialogTitle className="sr-only">{t.expandChart}</DialogTitle>}
        </div>
        <ChartZoom>{children}</ChartZoom>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Card with a header and an expand button that opens the chart in a large
 * dialog. Pass a render function to size the chart differently inside the
 * dialog (it also gets a callback that closes the dialog); plain children are
 * rendered as-is in both places.
 */
export function ExpandableChart({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode | ((expanded: boolean, close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const [bodyHeight, setBodyHeight] = useState<number>();
  const bodyRef = useRef<HTMLDivElement>(null);
  const isRender = typeof children === 'function';
  const close = () => setOpen(false);
  const render = (expanded: boolean) => (isRender ? children(expanded, close) : children);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            {subtitle && <div className="text-3xs font-mono text-subtle mt-0.5">{subtitle}</div>}
          </div>
          <ExpandButton
            onClick={() => {
              setBodyHeight(bodyRef.current?.offsetHeight);
              setOpen(true);
              track('agentic_workload_chart_expanded');
            }}
          />
        </div>
      </CardHeader>
      {/* Plain children (charts holding refs) live in one place at a time, so
          the card keeps its height while they are shown in the dialog. */}
      <CardContent ref={bodyRef} style={open && !isRender ? { minHeight: bodyHeight } : undefined}>
        {(isRender || !open) && render(false)}
      </CardContent>
      <ChartDialog open={open} onOpenChange={setOpen} title={title} subtitle={subtitle}>
        {open && (
          <div className={isRender ? undefined : '[&_svg]:!max-h-[calc(92vh-180px)]'}>
            {render(true)}
          </div>
        )}
      </ChartDialog>
    </Card>
  );
}

const ExpandContext = createContext<(() => void) | null>(null);

/**
 * Makes any chart expandable into the chart dialog without restructuring it:
 * an ExportPngButton (or an ExpandTrigger) inside gains an expand button, and
 * the dialog renders the same chart again at a larger size.
 */
export function Expandable({
  title,
  subtitle,
  corner = false,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Pin the expand button to the chart card's top-right, for charts without a controls row. */
  corner?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Both copies share the chart's refs (e.g. the SVG used for PNG export), and
  // unmounting the dialog copy nulls them; remounting the card copy on close
  // reattaches them. Chart state lives above this component, so nothing resets.
  const [generation, setGeneration] = useState(0);
  return (
    <ExpandContext.Provider
      value={() => {
        setOpen(true);
        track('agentic_workload_chart_expanded');
      }}
    >
      <Fragment key={generation}>
        {corner ? (
          <div className="relative">
            {children}
            <div className="absolute right-2 top-2">
              <ExpandButton
                onClick={() => {
                  setOpen(true);
                  track('agentic_workload_chart_expanded');
                }}
              />
            </div>
          </div>
        ) : (
          children
        )}
      </Fragment>
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
            {/* Chart SVGs drop their inline height caps so they scale to the dialog. */}
            <div className="mx-auto w-full max-w-[1100px] [&_svg:not(.lucide)]:!max-h-[70vh]">
              {children}
            </div>
          </ExpandContext.Provider>
        )}
      </ChartDialog>
    </ExpandContext.Provider>
  );
}

/** Expand button for the enclosing Expandable; renders nothing outside one or inside its dialog. */
export function ExpandTrigger() {
  const open = useContext(ExpandContext);
  return open ? <ExpandButton onClick={open} /> : null;
}
