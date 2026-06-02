'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface SvgOffset {
  right: number;
  top: number;
}

/**
 * Tracks the chart SVG's position inside the replay panel's relative wrapper so
 * the date overlay can anchor its bottom-right to the chart plot's top-right
 * (the wrapper also contains the legend, so we can't anchor to the wrapper
 * edge). Returns a callback ref for the wrapper element plus the measured
 * offset. The callback ref fires when the wrapper mounts/unmounts — including
 * after the panel transitions out of the loading state — which a `[]`-deps
 * effect would miss because it runs before the wrapper exists.
 */
export function useReplaySvgOffset(): {
  svgOffset: SvgOffset | null;
  setChartWrapperEl: (wrapper: HTMLDivElement | null) => void;
} {
  const [svgOffset, setSvgOffset] = useState<SvgOffset | null>(null);
  const observersRef = useRef<{ size: ResizeObserver; mutation: MutationObserver } | null>(null);

  const setChartWrapperEl = useCallback((wrapper: HTMLDivElement | null) => {
    if (observersRef.current) {
      observersRef.current.size.disconnect();
      observersRef.current.mutation.disconnect();
      observersRef.current = null;
    }
    if (!wrapper) {
      setSvgOffset(null);
      return;
    }
    let svgEl: SVGSVGElement | null = null;
    const measure = () => {
      const svg = wrapper.querySelector('svg');
      if (!svg) return;
      const wRect = wrapper.getBoundingClientRect();
      const sRect = svg.getBoundingClientRect();
      // When the legend sits to the right of the SVG, anchor the date's right
      // edge to the legend's left edge (with a small gap) so wide dates like
      // "2026-05-13" can't bleed into the legend column. Fall back to the
      // SVG's right edge when no legend column is present (mobile/stacked).
      // The legend container is positioned over the right edge of the SVG, so
      // its bounding rect overlaps the SVG horizontally — anchor the date's
      // right edge to the legend's left edge whenever it's present rather
      // than checking for non-overlap.
      const legend = wrapper.querySelector<HTMLElement>('[data-testid="chart-legend"]');
      const legendRect = legend?.getBoundingClientRect();
      const rightAnchor = legendRect
        ? wRect.right - legendRect.left + 12
        : wRect.right - sRect.right + 10;
      setSvgOffset((prev) => {
        const next = {
          right: Math.max(0, rightAnchor),
          top: sRect.top - wRect.top + 24,
        };
        if (prev && prev.right === next.right && prev.top === next.top) return prev;
        return next;
      });
      if (svgEl !== svg) {
        sizeRO.observe(svg);
        svgEl = svg;
      }
    };
    const sizeRO = new ResizeObserver(measure);
    sizeRO.observe(wrapper);
    const mo = new MutationObserver(measure);
    mo.observe(wrapper, { childList: true, subtree: true });
    observersRef.current = { size: sizeRO, mutation: mo };
    measure();
  }, []);

  useEffect(
    () => () => {
      observersRef.current?.size.disconnect();
      observersRef.current?.mutation.disconnect();
      observersRef.current = null;
    },
    [],
  );

  return { svgOffset, setChartWrapperEl };
}
