import type { SearchDoc } from './search-index';

/**
 * Subtrees that are site chrome, controls or non-text rendering. Charts are
 * SVG/canvas: their axis ticks are noise for a content search. The search
 * dialog itself opts out with `data-site-search-ignore`.
 */
const EXCLUDED_SELECTOR = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'header',
  'footer',
  'nav',
  'button',
  'select',
  'input',
  'textarea',
  '[role="dialog"]',
  // Authored aria-hidden only. An open modal (this dialog) marks everything
  // behind it aria-hidden with a `data-aria-hidden` marker; that is still the
  // page on screen and must be indexed.
  '[aria-hidden="true"]:not([data-aria-hidden])',
  '[data-site-search-ignore]',
].join(',');

const HEADING_SELECTOR = 'h1,h2,h3';
/** Caps shared with the build-time index so live and indexed pages match. */
export const MAX_SECTIONS_PER_PAGE = 80;
export const MAX_SECTION_CHARS = 4000;
const TITLE_SUFFIX = /\s*[|\u2013\u2014-]\s*InferenceX(?: by SemiAnalysis)?\s*$/u;

function clean(text: string): string {
  return text.replaceAll(/\s+/gu, ' ').trim();
}

export function cleanPageTitle(title: string): string {
  return clean(title).replace(TITLE_SUFFIX, '').trim();
}

function anchorFor(heading: Element): string | undefined {
  if (heading.id) return heading.id;
  const section = heading.closest('section[id]');
  return section?.id || undefined;
}

/**
 * Split the live document into heading-delimited sections.
 *
 * Text before the first heading becomes an untitled intro section together
 * with the meta description, so a page with no headings is still one doc.
 * Used only for the page on screen, which can be fresher than the build-time
 * index (live benchmark data, client-rendered panels).
 */
export function extractSections(doc: Document, path: string): SearchDoc[] {
  const root = doc.querySelector('main') ?? doc.body;
  if (!root) return [];
  const description = clean(
    doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
  );
  const h1 = root.querySelector('h1');
  const pageTitle = cleanPageTitle(doc.title) || clean(h1?.textContent ?? '') || path;

  const sections: { heading?: Element; text: string[] }[] = [{ text: [description] }];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        // REJECT skips the whole subtree; SKIP still visits children.
        if ((node as Element).matches(EXCLUDED_SELECTOR)) return NodeFilter.FILTER_REJECT;
        return (node as Element).matches(HEADING_SELECTOR)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      }
      // Heading text is captured from the heading element itself.
      return node.parentElement?.closest(HEADING_SELECTOR)
        ? NodeFilter.FILTER_SKIP
        : NodeFilter.FILTER_ACCEPT;
    },
  });

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (sections.length >= MAX_SECTIONS_PER_PAGE) break;
      sections.push({ heading: node as Element, text: [] });
      continue;
    }
    const value = node.nodeValue;
    if (value && value.trim()) sections.at(-1)!.text.push(value);
  }

  const docs: SearchDoc[] = [];
  for (const { heading, text } of sections) {
    const body = clean(text.join(' ')).slice(0, MAX_SECTION_CHARS);
    const title = heading ? clean(heading.textContent ?? '') : undefined;
    // The H1 usually repeats the page title; keep its body but not the label.
    const section = title && title !== pageTitle ? title : undefined;
    if (!body && !section) continue;
    const anchor = heading ? anchorFor(heading) : undefined;
    const url = anchor ? `${path}#${anchor}` : path;
    const previous = docs.at(-1);
    // Untitled runs sharing a URL (description, pre-H1 text, H1 body) are one result.
    if (previous && previous.url === url && !section && !previous.section) {
      previous.text = `${previous.text} ${body}`.trim().slice(0, MAX_SECTION_CHARS);
      continue;
    }
    docs.push({
      url,
      pageTitle,
      section,
      text: body,
      source: 'page',
    });
  }
  return docs;
}
