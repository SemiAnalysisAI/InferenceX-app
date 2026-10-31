import { useCallback, useState } from 'react';

import { CHART_FONT_MINECRAFT, CHART_FONT_SANS } from '@/lib/d3-chart/typography';
import { getExportFooterText } from '@/lib/export/export-footer';
import { useLocale } from '@/lib/i18n/use-locale';
import { hasDarkTheme } from '@/lib/themes/themes';

const STRINGS = {
  en: { exportFailed: 'Failed to export image. Please try again.' },
  zh: { exportFailed: '图片导出失败，请重试。' },
};

interface UseChartExportOptions {
  chartId: string;
  setIsLegendExpanded?: (expanded: boolean) => void;
  hideLegend?: boolean;
  exportFileName?: string;
}

export type PngAspectRatio = 'auto' | '16:9' | '1:1';

/** Expand the canvas without cropping or stretching any captured content. */
export function getPngExportDimensions(
  width: number,
  height: number,
  aspectRatio: PngAspectRatio,
): { width: number; height: number } {
  if (aspectRatio === 'auto') return { width, height };
  const [w, h] = aspectRatio === '16:9' ? [16, 9] : [1, 1];
  const unit = Math.ceil(Math.max(width / w, height / h));
  return { width: unit * w, height: unit * h };
}

function applyStyles(el: HTMLElement | null, styles: Partial<CSSStyleDeclaration>) {
  if (!el) return;
  for (const [key, value] of Object.entries(styles)) {
    (el.style as any)[key] = value;
  }
}

const CSS_VAR_RE = /var\(--(?<varName>[^)]+)\)/u;

export function getExportFontFamily(): string {
  const isMinecraftTheme =
    typeof document !== 'undefined' &&
    (document.documentElement.classList.contains('minecraft') ||
      document.body.classList.contains('minecraft'));

  if (isMinecraftTheme) {
    return CHART_FONT_MINECRAFT;
  }

  return CHART_FONT_SANS;
}

function getResolvedExportFontFamily(): string {
  if (typeof document === 'undefined') {
    return getExportFontFamily();
  }

  const probe = document.createElement('span');
  probe.textContent = 'A';
  probe.style.position = 'fixed';
  probe.style.left = '-9999px';
  probe.style.top = '-9999px';
  document.body.append(probe);

  const resolved = getComputedStyle(probe).fontFamily;
  probe.remove();

  return resolved || getExportFontFamily();
}

function resolveCssVarsForExport(root: HTMLElement) {
  const rootStyles = getComputedStyle(document.documentElement);

  function resolve(raw: string): string {
    let resolved = raw;
    let match: RegExpExecArray | null;
    while ((match = CSS_VAR_RE.exec(resolved)) !== null) {
      const computed = rootStyles.getPropertyValue(`--${match[1]}`).trim();
      resolved = resolved.replace(match[0], computed || match[0]);
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

  for (const el of [...root.querySelectorAll('svg, svg *')] as SVGElement[]) {
    for (const attr of PRESENTATION_ATTRS) {
      const val = el.getAttribute(attr);
      if (val && CSS_VAR_RE.test(val)) {
        el.setAttribute(attr, resolve(val));
      }
    }

    const style = el.style;
    for (const prop of style) {
      const val = style.getPropertyValue(prop);
      if (val && CSS_VAR_RE.test(val)) {
        style.setProperty(prop, resolve(val));
      }
    }
  }

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
    for (const el of [...root.querySelectorAll(selector)] as SVGElement[]) {
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

function inlineComputedFontFamilyForExport(root: HTMLElement, resolvedFontFamily: string) {
  const elements = [root, ...root.querySelectorAll<HTMLElement>('*')];
  for (const el of elements) {
    el.style.fontFamily = resolvedFontFamily;
  }

  for (const textNode of root.querySelectorAll<SVGTextElement>('svg text, svg tspan')) {
    textNode.setAttribute('font-family', resolvedFontFamily);
  }
}

function getFontEmbedCSS(): string {
  const fontFaces: string[] = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules || []) {
        if (rule instanceof CSSFontFaceRule) fontFaces.push(rule.cssText);
      }
    } catch {}
  }
  return fontFaces.join('\n');
}

function waitForRender(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        resolve();
      }),
    );
  });
}

export function getExportCaptureDimensions(element: HTMLElement): {
  width: number;
  height: number;
} {
  const bounds = element.getBoundingClientRect();
  return {
    width: Math.ceil(Math.max(bounds.width, element.clientWidth, element.scrollWidth)),
    height: Math.ceil(Math.max(bounds.height, element.clientHeight, element.scrollHeight)),
  };
}

export function normalizeChartSvgWidthsForExport(root: HTMLElement): void {
  for (const svg of root.querySelectorAll<SVGElement>('svg[data-testid="d3-chart-svg"]')) {
    svg.style.width = '100%';
  }
}

function watermarkFont(size: number): string {
  return `bold ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => resolve(null));
    img.src = src;
  });
}

export async function addWatermark(
  chartDataUrl: string,
  bgColor: string,
  aspectRatio: PngAspectRatio = 'auto',
): Promise<string> {
  const img = await loadImage(chartDataUrl);
  if (!img) throw new Error('Could not decode the chart PNG');

  const isDark = hasDarkTheme(document.documentElement) || bgColor.includes('0 0%');

  const WATERMARK_HEIGHT = 120;
  const canvas = document.createElement('canvas');
  const dimensions = getPngExportDimensions(img.width, img.height + WATERMARK_HEIGHT, aspectRatio);
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('PNG canvas is unavailable');

  ctx.fillStyle = bgColor || (isDark ? '#131416' : '#eaebec');
  const contentHeight = canvas.height - WATERMARK_HEIGHT;
  ctx.fillRect(0, 0, canvas.width, contentHeight);

  ctx.drawImage(img, (canvas.width - img.width) / 2, (contentHeight - img.height) / 2);

  ctx.fillStyle = isDark ? '#1a1a2e' : '#f5f5f5';
  ctx.fillRect(0, contentHeight, canvas.width, WATERMARK_HEIGHT);

  const footerText = getExportFooterText();
  let fontSize = 40;
  ctx.font = watermarkFont(fontSize);
  const maxTextWidth = canvas.width - 48;
  const textWidth = ctx.measureText(footerText).width;
  if (textWidth > maxTextWidth) {
    fontSize = Math.max(16, Math.floor((fontSize * maxTextWidth) / textWidth));
    ctx.font = watermarkFont(fontSize);
  }
  ctx.fillStyle = isDark ? '#aaa' : '#555';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(footerText, canvas.width / 2, contentHeight + WATERMARK_HEIGHT / 2);

  return canvas.toDataURL('image/png');
}

export function useChartExport({
  chartId,
  setIsLegendExpanded,
  hideLegend = false,
  exportFileName,
}: UseChartExportOptions) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const [isExporting, setIsExporting] = useState(false);

  const exportToImage = useCallback(
    async (ratio: PngAspectRatio = 'auto') => {
      setIsExporting(true);

      let wasClosed = false;
      if (setIsLegendExpanded && !hideLegend) {
        const el = document.querySelector(`#${chartId}`);
        wasClosed = Boolean(el?.querySelector('[data-testid="legend-open-button"]'));
        if (wasClosed) {
          setIsLegendExpanded(true);
          await waitForRender();
        }
      }

      try {
        const htmlToImagePromise = import('@jpinsonneau/html-to-image');

        const element = document.querySelector(`#${chartId}`);
        if (!element) throw new Error('Chart element not found');

        const exportElement = document.querySelector<HTMLElement>(`#${chartId}-export`);
        if (!exportElement) throw new Error('Export container not found');

        const clone = element.cloneNode(true) as HTMLElement;
        const liveSelects = element.querySelectorAll('select');
        clone.querySelectorAll('select').forEach((select, i) => {
          select.value = liveSelects[i].value;
        });
        clone.removeAttribute('id');
        const nestedExport = clone.querySelector(`[id="${chartId}-export"]`);
        if (nestedExport) nestedExport.remove();
        if (hideLegend) {
          for (const legend of clone.querySelectorAll(
            '[data-slot="chart-legend-wrapper"], .legend-container',
          )) {
            legend.remove();
          }
        }

        const figcaption = clone.querySelector('figcaption');
        if (figcaption) {
          const heading = figcaption.querySelector('h2');
          if (heading) (heading as HTMLElement).style.whiteSpace = 'nowrap';

          const origCaption = element.querySelector('figcaption');
          if (origCaption) {
            const origEls = [origCaption, ...origCaption.querySelectorAll('*')] as HTMLElement[];
            const cloneEls = [figcaption, ...figcaption.querySelectorAll('*')] as HTMLElement[];
            for (let i = 0; i < origEls.length; i++) {
              if (!cloneEls[i]) continue;
              (cloneEls[i] as HTMLElement).style.color = getComputedStyle(origEls[i]!).color;
            }
          }
        }

        exportElement.append(clone);

        if (wasClosed && setIsLegendExpanded) {
          setIsLegendExpanded(false);
        }

        const bgColor = getComputedStyle(document.documentElement)
          .getPropertyValue('--background')
          .trim();
        const legendContainer = clone.querySelectorAll('.legend-container')[0] as
          | HTMLElement
          | undefined;

        applyStyles(exportElement, { width: 'fit-content', overflow: 'visible', padding: '16px' });

        for (const scroller of clone.querySelectorAll<HTMLElement>('[data-chart-scroll]')) {
          applyStyles(scroller, { width: 'fit-content', overflow: 'visible' });
          scroller.scrollLeft = 0;
        }
        const flexContainer = clone.querySelector(
          ':scope > .flex, [data-chart-scroll] > .flex',
        ) as HTMLElement | null;
        applyStyles(flexContainer, {
          flexDirection: 'row',
          width: 'fit-content',
          gap: '16px',
          overflow: 'visible',
        });

        const svgWrapper = clone.querySelector('.relative > .relative') as HTMLElement | null;
        if (svgWrapper) {
          const originalWidth =
            (element.querySelector('.relative > .relative') as HTMLElement)?.offsetWidth ||
            (element as HTMLElement).offsetWidth;
          applyStyles(svgWrapper, { width: `${originalWidth}px`, flexShrink: '0' });
          const svgParent = svgWrapper.parentElement as HTMLElement | null;
          applyStyles(svgParent, {
            width: `${originalWidth}px`,
            flexShrink: '0',
            minWidth: 'auto',
          });
        }

        if (legendContainer) {
          legendContainer.style.cssText +=
            '; position: relative !important; right: auto !important; top: auto !important; left: auto !important; bottom: auto !important; width: auto !important; min-width: fit-content !important; height: auto !important; min-height: 0 !important; max-height: none !important; z-index: auto !important; overflow: visible !important; padding: 8px !important;';

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
          applyStyles(contentWrapper, {
            width: 'fit-content',
            height: 'auto',
            overflow: 'visible',
          });

          const chartWrapper = contentWrapper?.parentElement as HTMLElement | null;
          applyStyles(chartWrapper, {
            width: 'fit-content',
            flexShrink: '0',
            height: 'auto',
            overflow: 'visible',
            position: 'relative',
          });
        }

        for (const el of clone.querySelectorAll('.no-export')) {
          (el as HTMLElement).style.display = 'none';
        }
        for (const el of clone.querySelectorAll('.export-only')) {
          (el as HTMLElement).style.display = 'inline';
        }
        for (const el of clone.querySelectorAll('[id$="-export"]')) {
          (el as HTMLElement).parentElement!.style.display = 'none';
        }

        if (legendContainer) {
          for (const el of legendContainer.querySelectorAll('.text-red-900')) {
            (el as HTMLElement).style.color = 'inherit';
            (el as HTMLElement).style.fontWeight = 'normal';
          }
        }

        if (legendContainer) {
          const scrollContainer = legendContainer.querySelector(
            'ul, [class*="overflow"]',
          ) as HTMLElement | null;
          if (scrollContainer) {
            const sibling = scrollContainer.nextElementSibling as HTMLElement | null;
            const hasVisibleControls =
              sibling &&
              sibling.style.display !== 'none' &&
              [...sibling.children].some(
                (child) => (child as HTMLElement).style.display !== 'none',
              );
            if (!hasVisibleControls) {
              scrollContainer.style.borderBottom = 'none';
              scrollContainer.style.paddingBottom = '0';
            }
          }
        }

        if (legendContainer) {
          const legendList = legendContainer.querySelector('ul');
          if (legendList) {
            const firstVisible = [...legendList.children].find(
              (child) => (child as HTMLElement).style.display !== 'none',
            ) as HTMLElement | undefined;
            if (firstVisible && firstVisible !== legendList.firstElementChild) {
              firstVisible.style.paddingTop = '4px';
            }
          }
        }

        const resolvedExportFontFamily = getResolvedExportFontFamily();

        resolveCssVarsForExport(exportElement);
        inlineComputedFontFamilyForExport(exportElement, resolvedExportFontFamily);

        for (const label of clone.querySelectorAll('label')) {
          label.style.fontSize = '12px';
        }
        for (const span of clone.querySelectorAll('span')) {
          span.style.fontSize = '14px';
        }
        normalizeChartSvgWidthsForExport(clone);

        try {
          await document.fonts.ready;
        } catch {
          await new Promise((resolve) => {
            setTimeout(resolve, 300);
          });
        }

        const htmlToImage = await htmlToImagePromise;
        const { toPng } = htmlToImage;
        let fontEmbedCSS = getFontEmbedCSS();
        if (typeof htmlToImage.getFontEmbedCSS === 'function') {
          try {
            fontEmbedCSS = await htmlToImage.getFontEmbedCSS(exportElement);
          } catch {}
        }
        const captureDimensions = getExportCaptureDimensions(exportElement);
        const chartDataUrl = await toPng(exportElement, {
          ...captureDimensions,
          quality: 1,
          pixelRatio: 2,
          cacheBust: true,
          skipFonts: false,
          fontEmbedCSS,
          preferredFontFormat: 'woff2',
          filter: (node) => !node.classList?.contains('no-export'),
          style: {
            transform: 'scale(1)',
            fontFamily: resolvedExportFontFamily,
          },
        });

        const dataUrl = await addWatermark(chartDataUrl, bgColor, ratio);

        const link = document.createElement('a');
        link.download = `${exportFileName || chartId}-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();

        window.dispatchEvent(new CustomEvent('inferencex:action'));
      } catch (error) {
        console.error('Error exporting image:', error);
        alert(t.exportFailed);
        if (wasClosed && setIsLegendExpanded) setIsLegendExpanded(false);
      } finally {
        setIsExporting(false);
        const exportElement = document.querySelector<HTMLElement>(`#${chartId}-export`);
        if (exportElement) exportElement.innerHTML = '';
      }
    },
    [chartId, setIsLegendExpanded, hideLegend, exportFileName, t],
  );

  return { isExporting, exportToImage };
}
