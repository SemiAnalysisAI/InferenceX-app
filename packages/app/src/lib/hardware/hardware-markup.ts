export interface HardwareLink {
  label: string;
  href: string;
}

export interface LedeSegment {
  text: string;
  strong: boolean;
  start: number;
}

export const MARKDOWN_LINK = /\[(?<label>[^\]\n]+)\]\((?<href>[^)\s]+)\)/u;

export function ledeSegments(lede: string): LedeSegment[] {
  const segments: LedeSegment[] = [];
  let start = 0;
  lede.split('**').forEach((text, index) => {
    if (text) segments.push({ text, strong: index % 2 === 1, start });
    start += text.length + 2;
  });
  return segments;
}

export function isExternalHref(href: string): boolean {
  return /^https?:\/\//u.test(href);
}

export function isSupportedHref(href: string): boolean {
  if (href.startsWith('/')) return !href.startsWith('//');
  return /^https:\/\/[^\s/]+/u.test(href);
}
