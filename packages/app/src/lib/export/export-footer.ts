export const EXPORT_FOOTER_FALLBACK_HOST = 'inferencex.semianalysis.com';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

export interface ExportFooterLocation {
  hostname: string;
  pathname: string;
}

export interface ExportFooterStyle {
  backgroundColor: string;
  color: string;
  fontFamily: string;
}

export function getExportFooterStyle(root: HTMLElement): ExportFooterStyle {
  const probe = document.createElement('span');
  probe.style.cssText =
    'position:fixed;left:-9999px;top:-9999px;background-color:var(--background);color:var(--foreground)';
  root.append(probe);
  try {
    const style = getComputedStyle(probe);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      fontFamily: style.fontFamily,
    };
  } finally {
    probe.remove();
  }
}

export function drawExportFooter(
  ctx: CanvasRenderingContext2D,
  style: ExportFooterStyle,
  width: number,
  top: number,
  height: number,
  fontSize: number,
): void {
  ctx.fillStyle = style.backgroundColor;
  ctx.fillRect(0, top, width, height);
  const text = getExportFooterText();
  ctx.font = `bold ${fontSize}px ${style.fontFamily}`;
  const maxWidth = Math.max(1, width - 48);
  const textWidth = ctx.measureText(text).width;
  if (textWidth > maxWidth) {
    fontSize = Math.max(1, Math.floor((fontSize * maxWidth) / textWidth));
    ctx.font = `bold ${fontSize}px ${style.fontFamily}`;
  }
  ctx.fillStyle = style.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, top + height / 2, maxWidth);
}

export function getExportFooterText(location?: ExportFooterLocation | null): string {
  const loc =
    location ?? (typeof window !== 'undefined' && window.location ? window.location : null);

  const rawHost = loc?.hostname?.trim().toLowerCase() ?? '';
  const host = rawHost && !LOCAL_HOSTNAMES.has(rawHost) ? rawHost : EXPORT_FOOTER_FALLBACK_HOST;

  let path = loc?.pathname ?? '/';
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/+$/u, '');

  return `${host}${path}`;
}
