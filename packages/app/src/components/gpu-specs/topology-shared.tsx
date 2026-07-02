'use client';

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import type * as d3 from 'd3';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { track } from '@/lib/analytics';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { GpuSpec } from '@/lib/gpu-specs';

// ─── Shared pure rendering helpers ───────────────────────────────────────────

/** SemiAnalysis brand colors used for GPU boxes/connections, keyed by vendor. */
const NVIDIA_COLOR = '#76b900';
const AMD_COLOR = '#ed1c24';

/** Vendor accent color for GPU boxes and connection strokes. */
export function getVendorColor(spec: GpuSpec): string {
  return spec.vendor === 'nvidia' ? NVIDIA_COLOR : AMD_COLOR;
}

/** A position on a row: box left edge (`x`) and box center (`cx`). */
export interface RowPosition {
  x: number;
  cx: number;
}

/**
 * Evenly-spaced positions for a row of `count` boxes of width `boxW` separated
 * by `gap`, starting at `startX`. Returns each box's left edge and center.
 */
export function linearPositions(
  count: number,
  startX: number,
  boxW: number,
  gap: number,
): RowPosition[] {
  return Array.from({ length: count }, (_, i) => ({
    x: startX + i * (boxW + gap),
    cx: startX + i * (boxW + gap) + boxW / 2,
  }));
}

type D3Container = d3.Selection<HTMLDivElement, unknown, null, undefined>;
type D3Svg = d3.Selection<SVGSVGElement, unknown, null, undefined>;

/**
 * Append an <svg> to `container` with a centered SemiAnalysis logo watermark
 * behind the diagram, matching the byte-identical watermark block used by every
 * topology renderer. Returns the <svg> selection for the caller to draw into.
 *
 * The watermark image is 30% of the viewBox, centered, at 0.1 opacity — added
 * first (as a pattern-filled rect) so all subsequent content draws on top.
 */
export function appendWatermarkedSvg(
  container: D3Container,
  opts: {
    /** viewBox width */
    width: number;
    /** viewBox height */
    height: number;
    /** Unique <pattern> id (must be unique across all SVGs on the page) */
    patternId: string;
    /** Tailwind classes applied to the <svg> (width/max-width constraints) */
    svgClass: string;
    /** Accessible label for the diagram */
    ariaLabel: string;
  },
): D3Svg {
  const { width, height, patternId, svgClass, ariaLabel } = opts;

  const svg = container
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('class', svgClass)
    .attr('role', 'img')
    .attr('aria-label', ariaLabel);

  svg
    .append('defs')
    .append('pattern')
    .attr('id', patternId)
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', width)
    .attr('height', height)
    .append('image')
    .attr('href', '/brand/logo-color.webp')
    .attr('width', width * 0.3)
    .attr('height', height * 0.3)
    .attr('x', (width - width * 0.3) / 2)
    .attr('y', (height - height * 0.3) / 2)
    .attr('opacity', 0.1);

  svg
    .insert('rect', ':first-child')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', `url(#${patternId})`);

  return svg;
}

// ─── Shared dialog + navigation infrastructure ───────────────────────────────

export interface TopologyDialogHandle {
  openDialog: () => void;
}

interface UseTopologyDialogOptions {
  spec: GpuSpec;
  allSpecs: GpuSpec[];
  /** analytics event fired when the dialog is opened */
  expandedEvent: string;
  /** analytics event fired when navigating prev/next within the dialog */
  navigatedEvent: string;
}

export interface TopologyDialogState {
  open: boolean;
  setOpen: (open: boolean) => void;
  displayedIndex: number;
  displayedSpec: GpuSpec;
  navigate: (direction: 'prev' | 'next') => void;
  /** open the dialog focused on `spec` — used by both the ref and the button */
  handleExpand: () => void;
}

/**
 * Shared state + behavior for the expand-to-dialog topology components:
 * open/displayed-index state, prev/next wrap-around navigation, the imperative
 * `openDialog()` handle, and keyboard arrow navigation while open. The only
 * per-diagram differences are the two analytics event names.
 */
export function useTopologyDialog(
  ref: Ref<TopologyDialogHandle>,
  { spec, allSpecs, expandedEvent, navigatedEvent }: UseTopologyDialogOptions,
): TopologyDialogState {
  const [open, setOpen] = useState(false);
  const [displayedIndex, setDisplayedIndex] = useState(0);
  const displayedIndexRef = useRef(0);
  displayedIndexRef.current = displayedIndex;

  const displayedSpec = allSpecs[displayedIndex] ?? spec;

  const navigate = useCallback(
    (direction: 'prev' | 'next') => {
      const currentIdx = displayedIndexRef.current;
      const newIdx =
        direction === 'prev'
          ? currentIdx > 0
            ? currentIdx - 1
            : allSpecs.length - 1
          : currentIdx < allSpecs.length - 1
            ? currentIdx + 1
            : 0;
      setDisplayedIndex(newIdx);
      track(navigatedEvent, {
        gpu: allSpecs[newIdx].name,
        direction,
      });
    },
    [allSpecs, navigatedEvent],
  );

  const handleExpand = useCallback(() => {
    const idx = allSpecs.findIndex((s) => s.name === spec.name);
    setDisplayedIndex(Math.max(idx, 0));
    setOpen(true);
    track(expandedEvent, { gpu: spec.name });
  }, [allSpecs, spec.name, expandedEvent]);

  useImperativeHandle(ref, () => ({ openDialog: handleExpand }), [handleExpand]);

  // Keyboard arrow navigation when dialog is open
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigate('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigate('next');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, navigate]);

  return { open, setOpen, displayedIndex, displayedSpec, navigate, handleExpand };
}

interface TopologyDialogShellProps {
  state: TopologyDialogState;
  /** heading shown above the compact diagram (GPU name) */
  title: string;
  /** small muted text next to the heading in the compact view */
  compactSubtitle: ReactNode;
  /** aria-label for the expand button */
  expandLabel: string;
  /** compact (clickable) diagram */
  compact: ReactNode;
  /** prefix for the prev/next `data-testid` (e.g. "topology" or "scaleup-topology") */
  testIdPrefix: string;
  /** Tailwind max-width class for the dialog content */
  dialogClassName: string;
  /** dialog title node */
  dialogTitle: ReactNode;
  /** dialog description node */
  dialogDescription: ReactNode;
  /** dialog body (expanded diagram + detail panel); null renders nothing */
  dialogBody: ReactNode;
}

/**
 * Presentational shell shared by both topology diagrams: the header + clickable
 * compact preview, and the expand Dialog with prev/next navigation buttons.
 * All diagram-specific content is passed in as nodes so the two layout
 * algorithms and detail panels stay separate and readable.
 */
export function TopologyDialogShell({
  state,
  title,
  compactSubtitle,
  expandLabel,
  compact,
  testIdPrefix,
  dialogClassName,
  dialogTitle,
  dialogDescription,
  dialogBody,
}: TopologyDialogShellProps) {
  const { open, setOpen, navigate, handleExpand } = state;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="text-xs text-muted-foreground">{compactSubtitle}</span>
      </div>
      <button
        type="button"
        className="cursor-pointer rounded-md hover:bg-muted/50 transition-colors p-1 -m-1"
        onClick={handleExpand}
        aria-label={expandLabel}
      >
        {compact}
        <p className="text-[10px] text-muted-foreground mt-1 text-center">Click to expand</p>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={dialogClassName}>
          <div className="flex items-center gap-2 pr-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('prev')}
              aria-label="Previous GPU"
              data-testid={`${testIdPrefix}-nav-prev`}
            >
              <ChevronLeft className="size-5" />
            </Button>
            <DialogHeader className="flex-1">
              <DialogTitle>{dialogTitle}</DialogTitle>
              <DialogDescription>{dialogDescription}</DialogDescription>
            </DialogHeader>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('next')}
              aria-label="Next GPU"
              data-testid={`${testIdPrefix}-nav-next`}
            >
              <ChevronRight className="size-5" />
            </Button>
          </div>
          {dialogBody}
        </DialogContent>
      </Dialog>
    </div>
  );
}
