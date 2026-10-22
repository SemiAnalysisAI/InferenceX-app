export const EXPORT_FOOTER_FALLBACK_HOST = 'inferencex.semianalysis.com';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

export interface ExportFooterLocation {
  hostname: string;
  pathname: string;
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
