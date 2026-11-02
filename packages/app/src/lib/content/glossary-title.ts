import { fitMetaTitle } from '@/lib/seo/meta-text';

import type { GlossaryEntry } from './glossary';

const MINOR_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'per',
  'the',
  'to',
  'via',
  'vs',
  'vs.',
  'with',
]);

function titleCaseSegment(segment: string, isFirst: boolean): string {
  // Anything already carrying capitals, digits or punctuation is a name or identifier (vLLM, P90, tok/$).
  if (!/^[a-z]+\.?$/u.test(segment)) return segment;
  if (!isFirst && MINOR_WORDS.has(segment)) return segment;
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

/**
 * Title-cases a glossary term for search titles: "Pareto frontier" becomes "Pareto Frontier" and
 * "Scale-up vs. scale-out networking" becomes "Scale-Up vs. Scale-Out Networking". Single-token
 * terms are left alone because they are product names or identifiers (llm-d, torch.compile).
 */
export function titleCaseGlossaryTerm(term: string): string {
  if (!/\s/u.test(term)) return term;
  return term
    .split(' ')
    .map((word, wordIndex) =>
      word
        .split('-')
        .map((segment, segmentIndex) =>
          titleCaseSegment(segment, wordIndex === 0 && segmentIndex === 0),
        )
        .join('-'),
    )
    .join(' ');
}

/** The parenthetical after the term: an explicit expansion, else a one-token abbreviation. */
function glossaryTitleQualifier(entry: GlossaryEntry): string | undefined {
  // Some translated terms already carry a parenthetical, e.g. "TPU（张量处理单元）".
  if (/[(（]/u.test(entry.term)) return undefined;
  if (entry.expansion) return entry.expansion;
  const abbreviation = entry.abbreviation;
  if (!abbreviation || abbreviation === entry.term || /\s/u.test(abbreviation)) return undefined;
  return abbreviation;
}

/** Glossary page title before the site suffix, e.g. "What Is Time to First Token (TTFT)?". */
export function glossaryMetaTitle(entry: GlossaryEntry, locale: 'en' | 'zh'): string {
  const qualifier = glossaryTitleQualifier(entry);
  if (locale === 'zh') {
    // Space only between CJK and a Latin or numeric term, never between two CJK characters.
    const lead = /^[\p{Script=Han}]/u.test(entry.term) ? '什么是' : '什么是 ';
    return fitMetaTitle([
      ...(qualifier ? [`${lead}${entry.term}（${qualifier}）？`] : []),
      `${lead}${entry.term}？`,
    ]);
  }
  const term = titleCaseGlossaryTerm(entry.term);
  return fitMetaTitle([
    ...(qualifier ? [`What Is ${term} (${qualifier})?`] : []),
    `What Is ${term}?`,
  ]);
}
