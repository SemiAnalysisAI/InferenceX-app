import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';

/**
 * Options for configuring the useChartZoom hook
 */
export interface UseChartZoomOptions {
  /** Chart-specific event name for zoom reset (e.g., 'reliability_zoom_reset') */
  resetEventName: string;

  /** Default zoom scale (k value). Defaults to 1 (no zoom) */
  defaultZoomK?: number;

  /** Min/max zoom scale extent [min, max]. Defaults to [1, 100] */
  scaleExtent?: [number, number];

  /** Optional callback to execute after zoom reset (e.g., reset filters, track analytics) */
  onReset?: () => void;

  /** SVG ref to animate zoom reset on **/
  svgRef: React.RefObject<SVGSVGElement | null>;
}

/**
 * Options for setting up zoom behavior on an SVG element
 */
export interface SetupZoomOptions {
  /** Translate extent to constrain panning [[x0, y0], [x1, y1]] */
  translateExtent?: [[number, number], [number, number]];

  /** Viewport extent [[x0, y0], [x1, y1]]. Defaults to [[0, 0], [width, height]] */
  extent?: [[number, number], [number, number]];

  /** Custom constrain function for advanced zoom/pan limiting */
  constrain?: (
    transform: d3.ZoomTransform,
    extent: [[number, number], [number, number]],
    translateExtent: [[number, number], [number, number]],
  ) => d3.ZoomTransform;

  /** Callback fired on every zoom event */
  onZoom?: (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => void;

  /** Custom transform storage function (e.g., to only store y-axis translation) */
  customTransformStorage?: (transform: d3.ZoomTransform) => d3.ZoomTransform;
}

/**
 * Return value from useChartZoom hook
 */
export interface UseChartZoomResult {
  /** D3 zoom behavior instance ref */
  zoomRef: React.MutableRefObject<d3.ZoomBehavior<SVGSVGElement, unknown> | null>;

  /** Current zoom transform ref */
  zoomTransformRef: React.MutableRefObject<d3.ZoomTransform>;

  /** Default zoom transform (based on defaultZoomK) */
  defaultZoomTransform: d3.ZoomTransform;

  /** Setup function to call in chart's main useEffect */
  setupZoom: (
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    width: number,
    height: number,
    options?: SetupZoomOptions,
  ) => d3.ZoomBehavior<SVGSVGElement, unknown>;
}

/**
 * Custom hook for managing D3 zoom behavior across charts
 *
 * This hook extracts the common zoom pattern used across all D3 charts:
 * - Manages zoom behavior and transform refs
 * - Listens for external reset events
 * - Provides a setupZoom function to configure zoom on an SVG
 * - Handles double-click reset and transform persistence
 *
 * @param options - Configuration options
 * @returns Zoom refs and setup function
 */
export function useChartZoom(options: UseChartZoomOptions): UseChartZoomResult {
  const { resetEventName, defaultZoomK = 1, scaleExtent = [1, 100], onReset, svgRef } = options;

  // create zoom behavior and transform refs
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const defaultZoomTransform = useMemo(() => d3.zoomIdentity.scale(defaultZoomK), [defaultZoomK]);
  const zoomTransformRef = useRef<d3.ZoomTransform>(defaultZoomTransform);
  const scaleExtentRef = useRef(scaleExtent);
  scaleExtentRef.current = scaleExtent;

  // listen for reset zoom events
  useEffect(() => {
    const handleResetZoom = () => {
      if (svgRef.current && zoomRef.current) {
        // update the ref first
        zoomTransformRef.current = defaultZoomTransform;

        // apply zoom reset with animation
        const transition = d3
          .select(svgRef.current)
          .transition('zoom')
          .duration(750)
          .call(zoomRef.current.transform as any, defaultZoomTransform);

        // call onReset after the animation completes to avoid race condition
        if (onReset) {
          transition.on('end', () => {
            onReset();
          });
        }
      }
    };

    window.addEventListener(resetEventName, handleResetZoom);
    return () => window.removeEventListener(resetEventName, handleResetZoom);
  }, [resetEventName, defaultZoomTransform, onReset, svgRef]);

  // setup zoom function - memoized to avoid recreating on every render
  const setupZoom = useCallback(
    (
      svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
      width: number,
      height: number,
      setupOptions?: SetupZoomOptions,
    ): d3.ZoomBehavior<SVGSVGElement, unknown> => {
      const {
        translateExtent = [
          [0, -Infinity],
          [width, Infinity],
        ],
        extent = [
          [0, 0],
          [width, height],
        ],
        constrain,
        onZoom,
        customTransformStorage,
      } = setupOptions || {};

      // create zoom behavior
      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .filter((event) => {
          // Require Shift for wheel zoom so bare scroll doesn't hijack the page.
          // Reject ctrlKey+wheel — browsers synthesize trackpad pinch as ctrl+wheel,
          // and those should fall through to native browser zoom, not chart zoom.
          if (event.type === 'wheel') return event.shiftKey && !event.ctrlKey;
          return !event.ctrlKey && !event.button;
        })
        // macOS swaps deltaY→deltaX when Shift is held (Chrome/Safari OS-level behavior).
        // Fall back to deltaX so D3 doesn't get delta=0 and compute pow(2,0)=1 (no zoom).
        .wheelDelta((event: WheelEvent) => {
          const delta = event.deltaY || event.deltaX;
          return -delta * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002);
        })
        .scaleExtent(scaleExtentRef.current)
        .extent(extent)
        .translateExtent(translateExtent);

      // apply custom constrain function if provided
      if (constrain) {
        zoom.constrain(constrain);
      }

      // set up zoom event handler
      if (onZoom) {
        zoom.on('zoom', onZoom);
      }

      // store transform on zoom events (with optional custom storage logic)
      zoom.on('zoom.store', (event) => {
        zoomTransformRef.current = customTransformStorage
          ? customTransformStorage(event.transform)
          : event.transform;
      });

      // apply zoom to SVG
      svg.call(zoom as any);

      // store zoom behavior in ref
      zoomRef.current = zoom;

      // restore previous zoom transform
      svg.call(zoom.transform as any, zoomTransformRef.current);

      // double-click to reset zoom
      svg.on('dblclick.zoom', () => {
        svg
          .transition('zoom')
          .duration(750)
          .call(zoom.transform as any, defaultZoomTransform);
        zoomTransformRef.current = defaultZoomTransform;
      });

      return zoom;
    },
    [defaultZoomTransform],
  );

  return {
    zoomRef,
    zoomTransformRef,
    defaultZoomTransform,
    setupZoom,
  };
}
