import type { Locale } from '@/lib/i18n';

const STRINGS = {
  en: {
    exportPng: 'Export PNG',
  },
  zh: {
    exportPng: '导出 PNG',
  },
} as const;

/**
 * Export an SVG element as a PNG image with a title overlay.
 * Detects minecraft/light mode from document classes.
 */
export function exportSvgToPng(
  svg: SVGSVGElement,
  opts: {
    title: string;
    subtitle?: string;
    filename: string;
    svgWidth: number;
    svgHeight: number;
  },
) {
  const isMinecraft = document.documentElement.classList.contains('minecraft');
  const bgColor = isMinecraft ? '#1e1e1e' : '#fafafa';
  const fgColor = isMinecraft ? '#ffffff' : '#171717';
  const mutedColor = isMinecraft ? '#aaaaaa' : '#666';

  const titleHeight = 40;
  const padding = 16;
  const scale = 2;

  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svg);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();

  img.addEventListener('load', () => {
    const canvasW = (opts.svgWidth + padding * 2) * scale;
    const canvasH = (opts.svgHeight + titleHeight + padding * 2) * scale;
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Title
    ctx.fillStyle = fgColor;
    ctx.font = 'bold 14px monospace';
    ctx.fillText(opts.title, padding, padding + 20);

    // Subtitle
    if (opts.subtitle) {
      ctx.fillStyle = mutedColor;
      ctx.font = '10px monospace';
      ctx.fillText(opts.subtitle, padding, padding + 34);
    }

    // SVG
    ctx.drawImage(img, padding, titleHeight + padding, opts.svgWidth, opts.svgHeight);
    URL.revokeObjectURL(url);

    // Download
    const a = document.createElement('a');
    a.download = opts.filename;
    a.href = canvas.toDataURL('image/png');
    a.click();
  });

  img.src = url;
}

/** Render an Export PNG button. */
export function ExportPngButton({
  onClick,
  label,
  locale = 'en',
}: {
  onClick: () => void;
  label?: string;
  locale?: Locale;
}) {
  const t = STRINGS[locale];
  const ariaLabel = label ?? t.exportPng;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="px-2 py-0.5 text-3xs font-mono rounded border border-border text-subtle hover:text-foreground hover:bg-surface-hover transition-colors"
    >
      {t.exportPng}
    </button>
  );
}
