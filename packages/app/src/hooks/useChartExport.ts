import { useCallback, useState } from 'react';

interface UseChartExportOptions {
  chartId: string;
  setIsLegendExpanded?: (expanded: boolean) => void;
  /** Human-readable base name for exported files (e.g. "DeepSeek-R1_throughput_interactivity"). Falls back to chartId. */
  exportFileName?: string;
}

/** Apply inline styles to an element */
function applyStyles(el: HTMLElement | null, styles: Partial<CSSStyleDeclaration>) {
  if (!el) return;
  for (const [key, value] of Object.entries(styles)) {
    (el.style as any)[key] = value;
  }
}

const CSS_VAR_RE = /var\(--([^)]+)\)/;

/**
 * Resolve all CSS `var(--*)` references in SVG presentation attributes and
 * inline styles within a subtree. html-to-image cannot resolve CSS custom
 * properties, so we bake the computed values into inline attributes/styles
 * before capture.
 */
function resolveCssVarsForExport(root: HTMLElement) {
  const rootStyles = getComputedStyle(document.documentElement);

  function resolve(raw: string): string {
    let resolved = raw;
    let match: RegExpExecArray | null;
    // Loop handles nested/multiple var() references
    while ((match = CSS_VAR_RE.exec(resolved)) !== null) {
      const computed = rootStyles.getPropertyValue(`--${match[1]}`).trim();
      resolved = resolved.replace(match[0], computed || match[0]);
      // Safety: if nothing changed, break to avoid infinite loop
      if (resolved === raw) break;
      raw = resolved;
    }
    return resolved;
  }

  const PRESENTATION_ATTRS = [
    'fill',
    'stroke',
    'color',
    'stop-color',
    'flood-color',
    'lighting-color',
  ];

  for (const el of Array.from(root.querySelectorAll('svg, svg *')) as SVGElement[]) {
    // Resolve presentation attributes (e.g. fill="var(--foreground)")
    for (const attr of PRESENTATION_ATTRS) {
      const val = el.getAttribute(attr);
      if (val && CSS_VAR_RE.test(val)) {
        el.setAttribute(attr, resolve(val));
      }
    }

    // Resolve inline style properties that use var()
    const style = el.style;
    for (let i = 0; i < style.length; i++) {
      const prop = style[i]!;
      const val = style.getPropertyValue(prop);
      if (val && CSS_VAR_RE.test(val)) {
        style.setProperty(prop, resolve(val));
      }
    }
  }

  // Also resolve computed styles applied via CSS rules (globals.css chart theming).
  // These aren't in inline style/attributes, so we read the computed value and bake it in.
  const COMPUTED_STYLE_SELECTORS: { selector: string; attrs: Record<string, string> }[] = [
    { selector: '.chart-root .grid line', attrs: { stroke: 'stroke' } },
    {
      selector: '.chart-root .x-axis .domain, .chart-root .y-axis .domain',
      attrs: { stroke: 'stroke' },
    },
    { selector: '.chart-root .tick line', attrs: { stroke: 'stroke' } },
    { selector: '.chart-root .tick text', attrs: { fill: 'fill' } },
    { selector: '.x-axis-label, .y-axis-label', attrs: { fill: 'fill' } },
  ];

  for (const { selector, attrs } of COMPUTED_STYLE_SELECTORS) {
    for (const el of Array.from(root.querySelectorAll(selector)) as SVGElement[]) {
      // Only set if the attribute isn't already resolved (from the loop above)
      for (const [svgAttr, cssProp] of Object.entries(attrs)) {
        const current = el.getAttribute(svgAttr);
        if (!current || CSS_VAR_RE.test(current)) {
          const computed = getComputedStyle(el).getPropertyValue(cssProp);
          if (computed) el.setAttribute(svgAttr, computed.trim());
        }
      }
    }
  }
}

/** Collect @font-face rules from all accessible stylesheets */
function getFontEmbedCSS(): string {
  const fontFaces: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules || [])) {
        if (rule instanceof CSSFontFaceRule) fontFaces.push(rule.cssText);
      }
    } catch {
      // skip CORS-restricted stylesheets
    }
  }
  return fontFaces.join('\n');
}

/** Wait for a React re-render to flush */
function waitForRender(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

/** Add a subtle watermark bar at the bottom of the exported image */
async function addWatermark(dataUrl: string, bgColor: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const WATERMARK_HEIGHT = 48;
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height + WATERMARK_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Draw watermark bar
      const isDark =
        document.documentElement.classList.contains('dark') || bgColor.includes('0 0%');
      ctx.fillStyle = isDark ? '#1a1a2e' : '#f5f5f5';
      ctx.fillRect(0, img.height, canvas.width, WATERMARK_HEIGHT);

      // Draw watermark text
      ctx.fillStyle = isDark ? '#aaa' : '#555';
      ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        'InferenceX — github.com/SemiAnalysisAI/InferenceX',
        canvas.width / 2,
        img.height + WATERMARK_HEIGHT / 2,
      );

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Custom hook for exporting charts as PNG images.
 */
export function useChartExport({
  chartId,
  setIsLegendExpanded,
  exportFileName,
}: UseChartExportOptions) {
  const [isExporting, setIsExporting] = useState(false);

  const exportToImage = useCallback(async () => {
    setIsExporting(true);

    // Temporarily expand the legend so the clone captures expanded state
    let wasCollapsed = false;
    if (setIsLegendExpanded) {
      const el = document.getElementById(chartId);
      const legend = el?.getElementsByClassName('legend-container')[0];
      wasCollapsed = !!legend && !legend.classList.contains('bg-accent');
      if (wasCollapsed) {
        setIsLegendExpanded(true);
        await waitForRender();
      }
    }

    try {
      const htmlToImagePromise = import('@jpinsonneau/html-to-image');

      const element = document.getElementById(chartId);
      if (!element) throw new Error('Chart element not found');

      const exportElement = document.getElementById(`${chartId}-export`);
      if (!exportElement) throw new Error('Export container not found');

      const clone = element.cloneNode(true) as HTMLElement;
      clone.removeAttribute('id');
      // Remove duplicate export container from the clone to avoid DOM id conflicts
      const nestedExport = clone.querySelector(`[id="${chartId}-export"]`);
      if (nestedExport) nestedExport.parentElement!.removeChild(nestedExport);

      // Bake computed text colors on the figcaption — html-to-image can't resolve
      // CSS custom properties (e.g. text-muted-foreground → var(--muted-foreground)).
      const figcaption = clone.querySelector('figcaption');
      if (figcaption) {
        // Prevent title from wrapping mid-phrase in the export (e.g. "End-to-end Latency")
        const heading = figcaption.querySelector('h2');
        if (heading) (heading as HTMLElement).style.whiteSpace = 'nowrap';

        const origCaption = element.querySelector('figcaption');
        if (origCaption) {
          const origEls = [
            origCaption,
            ...Array.from(origCaption.querySelectorAll('*')),
          ] as HTMLElement[];
          const cloneEls = [
            figcaption,
            ...Array.from(figcaption.querySelectorAll('*')),
          ] as HTMLElement[];
          for (let i = 0; i < origEls.length; i++) {
            if (!cloneEls[i]) continue;
            (cloneEls[i] as HTMLElement).style.color = getComputedStyle(origEls[i]!).color;
          }
        }
      }

      exportElement.appendChild(clone);

      // Restore collapsed state immediately after cloning
      if (wasCollapsed && setIsLegendExpanded) {
        setIsLegendExpanded(false);
      }

      const bgColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--background')
        .trim();
      const legendContainer = clone.getElementsByClassName('legend-container')[0] as
        | HTMLElement
        | undefined;

      // Layout: force side-by-side flex row for export
      applyStyles(exportElement, { width: 'fit-content', overflow: 'visible', padding: '16px' });

      const flexContainer = clone.querySelector(':scope > .flex') as HTMLElement | null;
      applyStyles(flexContainer, {
        flexDirection: 'row',
        width: 'fit-content',
        gap: '16px',
        overflow: 'visible',
      });

      // Lock chart SVG width to prevent collapse
      const svgWrapper = clone.querySelector('.relative > .relative') as HTMLElement | null;
      if (svgWrapper) {
        const originalWidth =
          (element.querySelector('.relative > .relative') as HTMLElement)?.offsetWidth ||
          element.offsetWidth;
        applyStyles(svgWrapper, { width: `${originalWidth}px`, flexShrink: '0' });
        // Also lock the flex-1 parent so min-w-0 doesn't collapse it
        const svgParent = svgWrapper.parentElement as HTMLElement | null;
        applyStyles(svgParent, { width: `${originalWidth}px`, flexShrink: '0', minWidth: 'auto' });
      }

      // Force legend into inline flow
      if (legendContainer) {
        legendContainer.style.cssText +=
          '; position: relative !important; right: auto !important; top: auto !important; left: auto !important; bottom: auto !important; width: auto !important; min-width: fit-content !important; z-index: auto !important; overflow: visible !important; padding: 8px !important;';

        const scrollContainer = legendContainer.querySelector(
          'ul, [class*="overflow"]',
        ) as HTMLElement | null;
        applyStyles(scrollContainer, {
          overflow: 'visible',
          scrollbarGutter: 'auto',
          paddingRight: '8px',
        });

        legendContainer.querySelectorAll('label').forEach((label) => {
          applyStyles(label, { width: '100%', whiteSpace: 'nowrap' });
        });
        legendContainer.querySelectorAll('label > span:last-child').forEach((span) => {
          applyStyles(span as HTMLElement, {
            overflow: 'visible',
            textOverflow: 'unset',
            whiteSpace: 'nowrap',
          });
        });

        const contentWrapper = legendContainer.parentElement as HTMLElement | null;
        applyStyles(contentWrapper, { width: 'fit-content', height: 'auto', overflow: 'visible' });

        const chartWrapper = contentWrapper?.parentElement as HTMLElement | null;
        applyStyles(chartWrapper, {
          width: 'fit-content',
          flexShrink: '0',
          height: 'auto',
          overflow: 'visible',
          position: 'relative',
        });
      }

      // Hide no-export elements, nested export containers
      for (const el of Array.from(clone.getElementsByClassName('no-export'))) {
        (el as HTMLElement).style.display = 'none';
      }
      for (const el of Array.from(clone.querySelectorAll('[id$="-export"]'))) {
        (el as HTMLElement).parentElement!.style.display = 'none';
      }

      // Strip red changelog highlighting from legend items in the export clone
      if (legendContainer) {
        for (const el of Array.from(legendContainer.querySelectorAll('.text-red-900'))) {
          (el as HTMLElement).style.color = 'inherit';
          (el as HTMLElement).style.fontWeight = 'normal';
        }
      }

      // Remove scroll container border if no visible bottom controls remain after hiding no-export
      if (legendContainer) {
        const scrollContainer = legendContainer.querySelector(
          'ul, [class*="overflow"]',
        ) as HTMLElement | null;
        if (scrollContainer) {
          const sibling = scrollContainer.nextElementSibling as HTMLElement | null;
          const hasVisibleControls =
            sibling &&
            sibling.style.display !== 'none' &&
            Array.from(sibling.children).some(
              (child) => (child as HTMLElement).style.display !== 'none',
            );
          if (!hasVisibleControls) {
            scrollContainer.style.borderBottom = 'none';
            scrollContainer.style.paddingBottom = '0';
          }
        }
      }

      // Pad first visible legend item if earlier siblings are hidden
      if (legendContainer) {
        const legendList = legendContainer.querySelector('ul');
        if (legendList) {
          const firstVisible = Array.from(legendList.children).find(
            (child) => (child as HTMLElement).style.display !== 'none',
          ) as HTMLElement | undefined;
          if (firstVisible && firstVisible !== legendList.firstElementChild) {
            firstVisible.style.paddingTop = '4px';
          }
        }
      }

      // Resolve all CSS var(--*) references in SVG elements (html-to-image can't resolve them)
      resolveCssVarsForExport(exportElement);

      // Normalize font sizes and SVG widths
      for (const label of Array.from(clone.getElementsByTagName('label'))) {
        label.style.fontSize = '12px';
      }
      for (const span of Array.from(clone.getElementsByTagName('span'))) {
        span.style.fontSize = '14px';
      }
      for (const svg of Array.from(clone.getElementsByTagName('svg'))) {
        svg.style.width = '100%';
      }

      // Wait for fonts before capture
      try {
        await document.fonts.ready;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Capture chart image
      const { toPng } = await htmlToImagePromise;
      const chartDataUrl = await toPng(exportElement, {
        quality: 1.0,
        pixelRatio: 2,
        backgroundColor: bgColor,
        cacheBust: true,
        skipFonts: false,
        fontEmbedCSS: getFontEmbedCSS(),
        preferredFontFormat: 'woff2',
        filter: (node) => !node.classList?.contains('no-export'),
        style: {
          transform: 'scale(1)',
          fontFamily:
            'var(--font-dm-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      });

      // Add watermark with InferenceX branding
      const dataUrl = await addWatermark(chartDataUrl, bgColor);

      const link = document.createElement('a');
      link.download = `${exportFileName || chartId}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();

      // Dispatch action event for post-action star prompt
      window.dispatchEvent(new CustomEvent('inferencex:action'));
    } catch (error) {
      console.error('Error exporting image:', error);
      alert('Failed to export image. Please try again.');
      if (wasCollapsed && setIsLegendExpanded) setIsLegendExpanded(false);
    } finally {
      setIsExporting(false);
      const exportElement = document.getElementById(`${chartId}-export`);
      if (exportElement) exportElement.innerHTML = '';
    }
  }, [chartId, setIsLegendExpanded]);

  return { isExporting, exportToImage };
}
