import { extractHeadings } from '@/lib/blog/blog';

import type { IndexedSection } from './index-format';
import { MAX_SECTION_CHARS, MAX_SECTIONS_PER_PAGE } from './extract';

/**
 * Plain-text sections from an MDX article (blog posts and model pages), split
 * at `#`–`###` headings. Anchors come from `extractHeadings`, the same helper
 * that builds the rendered table of contents, so `#anchor` links in results
 * land on the heading the reader sees.
 *
 * The output approximates what the live-DOM extractor reads from the rendered
 * page: prose, list items, table cells, code and figure captions. Embedded
 * JSON-LD, call-to-action buttons and blurred teaser blocks are dropped.
 */

const FENCE = /^\s*(?:```|~~~)/u;
const HEADING = /^(?<hashes>#{1,3})\s+(?<title>.+)$/u;
const DROP_BLOCKS: readonly RegExp[] = [
  /<JsonLd>[\s\S]*?<\/JsonLd>/gu,
  /<DashboardCTA\b[\s\S]*?<\/DashboardCTA>/gu,
  /<Blur\b[\s\S]*?<\/Blur>/gu,
  /\{\/\*[\s\S]*?\*\/\}/gu,
  /<!--[\s\S]*?-->/gu,
];
const CAPTION = /\bcaption=(?:"(?<double>[^"]*)"|'(?<single>[^']*)'|\{`(?<template>[^`]*)`\})/gu;

function collapse(text: string): string {
  return text.replaceAll(/\s+/gu, ' ').trim();
}

/** Inline markdown to text: links keep their label, images and markup are dropped. */
export function inlineMarkdownToText(text: string): string {
  return collapse(
    text
      .replaceAll(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
      .replaceAll(/\[(?<label>[^\]]+)\]\([^)]*\)/gu, '$<label>')
      .replaceAll(/<\/?[A-Za-z][^>]*>/gu, ' ')
      .replaceAll(/(?<!\w)[*_]{1,3}(?=\S)|(?<=\S)[*_]{1,3}(?!\w)/gu, '')
      .replaceAll('`', '')
      .replaceAll(/\\(?<ch>[\\`*_{}[\]()#+\-.!|])/gu, '$<ch>'),
  );
}

/** Replace `<Figure … caption="…" />` with its caption text. */
function figuresToCaptions(source: string): string {
  return source.replaceAll(/<Figure\b[\s\S]*?\/>/gu, (tag) => {
    const captions = [...tag.matchAll(CAPTION)].map(
      (match) => match.groups!.double ?? match.groups!.single ?? match.groups!.template ?? '',
    );
    return captions.length > 0 ? `\n${captions.join(' ')}\n` : '\n';
  });
}

function blockLineToText(line: string): string {
  const trimmed = line.trim();
  if (/^(?:import|export)\s/u.test(trimmed)) return '';
  // Table separator rows (`| --- | :-: |`) and horizontal rules carry no text.
  if (/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?$/u.test(trimmed)) return '';
  if (/^(?:-{3,}|\*{3,}|_{3,})$/u.test(trimmed)) return '';
  const unprefixed = trimmed
    .replace(/^>\s?/u, '')
    .replace(/^(?:[-*+]|\d+[.)])\s+/u, '')
    .replaceAll('|', ' ');
  return inlineMarkdownToText(unprefixed);
}

export function mdxToSections(raw: string): IndexedSection[] {
  let source = raw;
  for (const pattern of DROP_BLOCKS) source = source.replaceAll(pattern, '\n');
  source = figuresToCaptions(source);

  const anchors = extractHeadings(raw);
  let nextAnchor = 0;
  const sections: { anchor?: string; heading?: string; lines: string[] }[] = [{ lines: [] }];
  let inFence = false;

  for (const line of source.split('\n')) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    const heading = inFence ? null : HEADING.exec(line);
    if (heading) {
      const title = heading.groups!.title.trim();
      // extractHeadings walks the raw source in the same order; match by text so
      // a heading removed with a dropped block cannot shift the anchors.
      let anchor: string | undefined;
      for (let i = nextAnchor; i < anchors.length; i++) {
        if (anchors[i].text === title) {
          anchor = anchors[i].id;
          nextAnchor = i + 1;
          break;
        }
      }
      if (sections.length >= MAX_SECTIONS_PER_PAGE) break;
      sections.push({ anchor, heading: inlineMarkdownToText(title), lines: [] });
      continue;
    }
    const text = inFence ? collapse(line) : blockLineToText(line);
    if (text) sections.at(-1)!.lines.push(text);
  }

  const result: IndexedSection[] = [];
  for (const { anchor, heading, lines } of sections) {
    const text = collapse(lines.join(' ')).slice(0, MAX_SECTION_CHARS);
    if (!text && !heading) continue;
    result.push({
      ...(anchor ? { anchor } : {}),
      ...(heading ? { heading } : {}),
      text,
    });
  }
  return result;
}
