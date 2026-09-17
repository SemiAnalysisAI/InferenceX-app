import { safePath } from './bundle';

// Report links are relative to report/index.html and may traverse within the bundle.
export function reportPath(value: string): string | null {
  if (value.startsWith('/') || /[\\:%?#]/u.test(value)) return null;
  const parts = ['report'];
  for (const part of value.split('/')) {
    if (part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(part);
  }
  try {
    return safePath(parts.join('/'));
  } catch {
    return null;
  }
}

export function renderReportHtml(rawHtml: string, urls: Map<string, string>): string {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  doc
    .querySelectorAll('script,base,iframe,object,embed,link,meta[http-equiv],form')
    .forEach((node) => node.remove());
  doc.querySelectorAll('[src], [href]').forEach((node) => {
    for (const attr of ['src', 'href']) {
      const value = node.getAttribute(attr);
      if (value !== null) {
        const path = reportPath(value);
        const url = path ? urls.get(path) : undefined;
        if (url) node.setAttribute(attr, url);
        else node.removeAttribute(attr);
      }
    }
  });
  const csp = doc.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content =
    "default-src 'none'; media-src blob: https:; img-src blob: data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'";
  doc.head.prepend(csp);
  return doc.documentElement.outerHTML;
}
