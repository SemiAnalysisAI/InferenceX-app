import { createHash } from 'node:crypto';
import path from 'node:path';

import ts from 'typescript';

export interface GuardViolation {
  readonly rule: string;
  readonly file?: string;
  readonly route?: string;
  readonly detail?: string;
  readonly missingFromEn?: readonly string[];
  readonly missingFromZh?: readonly string[];
}

interface BlogGuardExceptionBase {
  readonly file: string;
  readonly en: string;
  readonly zh: string;
  readonly reason: string;
  readonly removeWhen: string;
}

export type BlogGuardException =
  | (BlogGuardExceptionBase & { readonly rule: 'inline-code' })
  | (BlogGuardExceptionBase & {
      readonly rule: 'protected-token';
      readonly pairSha256?: string;
    });

export interface DictionaryGuardException {
  readonly file: string;
  readonly mismatchSha256: string;
  readonly reason: string;
  readonly removeWhen: string;
}

const HAN = /\p{Script=Han}/u;
const STRING_LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/gsu;
const CHIP_UNIT = /(?:tok|tokens?)\/s\/chip|\$\/chip[/-](?:hr|hour)|[A-Za-z]Chip\b|\bChip[A-Z]/giu;

function normalizedFile(file: string): string {
  return file.split(path.sep).join('/');
}

function pageRoute(file: string): { locale: 'en' | 'zh'; route: string } | null {
  const normalized = normalizedFile(file);
  const marker = 'src/app/';
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex === -1 || !normalized.endsWith('/page.tsx')) return null;

  let relative = normalized.slice(markerIndex + marker.length, -'/page.tsx'.length);
  const locale = relative === 'zh' || relative.startsWith('zh/') ? 'zh' : 'en';
  if (locale === 'zh') relative = relative === 'zh' ? '' : relative.slice(3);
  const segments = relative.split('/').filter((segment) => segment && !/^\(.+\)$/u.test(segment));
  return { locale, route: segments.length === 0 ? '/' : `/${segments.join('/')}` };
}

/** Compare real App Router page files after removing route groups. */
export function findRoutePairViolations(
  pageFiles: readonly string[],
  exemptRoutes: ReadonlySet<string> = new Set(),
): GuardViolation[] {
  const en = new Set<string>();
  const zh = new Set<string>();
  for (const file of pageFiles) {
    const page = pageRoute(file);
    if (!page || exemptRoutes.has(page.route)) continue;
    (page.locale === 'zh' ? zh : en).add(page.route);
  }

  return [
    ...[...en]
      .filter((route) => !zh.has(route))
      .map((route) => ({
        rule: 'route-sibling',
        route,
        detail: 'missing Simplified Chinese page',
      })),
    ...[...zh]
      .filter((route) => !en.has(route))
      .map((route) => ({ rule: 'route-sibling', route, detail: 'orphan Simplified Chinese page' })),
  ].sort((a, b) => (a.route ?? '').localeCompare(b.route ?? ''));
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyName(name: ts.PropertyName | undefined): string | null {
  if (!name || ts.isComputedPropertyName(name)) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function propertyInitializer(
  object: ts.ObjectLiteralExpression,
  key: string,
): ts.Expression | null {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || propertyName(property.name) !== key) continue;
    return unwrapExpression(property.initializer);
  }
  return null;
}

function structuralPaths(expression: ts.Expression, prefix = ''): Set<string> {
  const node = unwrapExpression(expression);
  const paths = new Set<string>();
  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      const key =
        ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)
          ? propertyName(property.name)
          : null;
      if (!key) continue;
      const next = prefix ? `${prefix}.${key}` : key;
      paths.add(next);
      if (ts.isPropertyAssignment(property)) {
        for (const nested of structuralPaths(property.initializer, next)) paths.add(nested);
      }
    }
  } else if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      if (ts.isSpreadElement(element)) continue;
      for (const nested of structuralPaths(element, prefix ? `${prefix}[]` : '[]'))
        paths.add(nested);
    }
  }
  return paths;
}

function parseSource(file: string, source: string): ts.SourceFile {
  if (file.endsWith('.json')) return ts.parseJsonText(file, source);
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
}

/** Find paired object-literal `en` / `zh` dictionaries and compare their explicit key shape. */
export function dictionaryViolationFingerprint(violation: GuardViolation): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        missingFromEn: violation.missingFromEn ?? [],
        missingFromZh: violation.missingFromZh ?? [],
      }),
    )
    .digest('hex');
}

export function findDictionaryParityViolations(
  file: string,
  source: string,
  exceptions: readonly DictionaryGuardException[] = [],
): GuardViolation[] {
  const sourceFile = parseSource(file, source);
  const violations: GuardViolation[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const en = propertyInitializer(node, 'en');
      const zh = propertyInitializer(node, 'zh');
      const enObject = en && ts.isObjectLiteralExpression(en) ? en : null;
      const zhObject = zh && ts.isObjectLiteralExpression(zh) ? zh : null;
      if (enObject || zhObject) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        if (!enObject || !zhObject) {
          violations.push({
            rule: 'dictionary-locale-pair',
            file: `${file}:${line}`,
            detail: enObject
              ? '`en` object has no `zh` object sibling'
              : '`zh` object has no `en` object sibling',
          });
        } else {
          const enPaths = structuralPaths(enObject);
          const zhPaths = structuralPaths(zhObject);
          const missingFromEn = [...zhPaths].filter((key) => !enPaths.has(key)).sort();
          const missingFromZh = [...enPaths].filter((key) => !zhPaths.has(key)).sort();
          if (missingFromEn.length > 0 || missingFromZh.length > 0) {
            violations.push({
              rule: 'dictionary-key-parity',
              file: `${file}:${line}`,
              missingFromEn,
              missingFromZh,
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const remainingExceptions = [...exceptions];
  return violations.filter((violation) => {
    const index = remainingExceptions.findIndex(
      (exception) =>
        normalizedFile(file).endsWith(exception.file) &&
        dictionaryViolationFingerprint(violation) === exception.mismatchSha256,
    );
    if (index === -1) return true;
    remainingExceptions.splice(index, 1);
    return false;
  });
}

/** Count object literals that contain at least one statically declared locale object. */
export function countLocaleDictionaryObjects(file: string, source: string): number {
  const sourceFile = parseSource(file, source);
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const en = propertyInitializer(node, 'en');
      const zh = propertyInitializer(node, 'zh');
      if ((en && ts.isObjectLiteralExpression(en)) || (zh && ts.isObjectLiteralExpression(zh))) {
        count += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return count;
}

function englishSubtrees(file: string, source: string): string[] {
  const sourceFile = parseSource(file, source);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && propertyName(node.name) === 'en') {
      found.push(node.initializer.getText(sourceFile));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found.sort();
}

function isEnglishSurfaceFile(file: string): boolean {
  const normalized = normalizedFile(file);
  if (normalized.endsWith('src/lib/zh-objective-guard-exceptions.json')) return false;
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(normalized) || normalized.includes('/cypress/')) {
    return false;
  }
  if (normalized.includes('content/blog/zh/')) return false;
  if (normalized.includes('content/blog/') && normalized.endsWith('.mdx')) return true;
  return /\.(?:[cm]?[jt]sx?|json)$/u.test(normalized);
}

/**
 * Explicit Chinese-only mode protects only provable English surfaces: complete English MDX files
 * and raw `en` property initializers. Locale-neutral plumbing is deliberately outside this check.
 */
export function compareEnglishSurfaces(
  file: string,
  baseSource: string,
  headSource: string,
): GuardViolation[] {
  if (!isEnglishSurfaceFile(file)) return [];
  const normalized = normalizedFile(file);
  if (normalized.includes('content/blog/') && normalized.endsWith('.mdx')) {
    return baseSource === headSource
      ? []
      : [{ rule: 'english-byte-preservation', file, detail: 'English MDX bytes changed' }];
  }
  const base = englishSubtrees(file, baseSource);
  const head = englishSubtrees(file, headSource);
  return JSON.stringify(base) === JSON.stringify(head)
    ? []
    : [{ rule: 'english-byte-preservation', file, detail: '`en` subtree bytes changed' }];
}

function multiset(values: readonly string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function multisetsEqual(left: readonly string[], right: readonly string[]): boolean {
  const a = multiset(left);
  const b = multiset(right);
  return a.size === b.size && [...a].every(([key, count]) => b.get(key) === count);
}

function multisetRemainder(left: readonly string[], right: readonly string[]): string[] {
  const remaining = multiset(right);
  return left.filter((value) => {
    const count = remaining.get(value) ?? 0;
    if (count === 0) return true;
    remaining.set(value, count - 1);
    return false;
  });
}

interface TextSpan {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

function fencedCodeSpans(raw: string): TextSpan[] {
  const lines = [...raw.matchAll(/[^\n]*(?:\n|$)/gu)].filter((match) => match[0] !== '');
  const spans: TextSpan[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const openingText = line[0].replace(/\r?\n$/u, '');
    const opening = /^ {0,3}(?<fence>`{3,}|~{3,})(?<info>.*)$/u.exec(openingText);
    if (!opening?.groups) continue;
    const fence = opening.groups.fence;
    if (fence.startsWith('`') && opening.groups.info.includes('`')) continue;
    const closing = new RegExp(
      `^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*\\r?$`,
      'u',
    );
    let endIndex = lines.length - 1;
    for (let candidate = index + 1; candidate < lines.length; candidate += 1) {
      if (closing.test(lines[candidate][0].replace(/\n$/u, ''))) {
        endIndex = candidate;
        break;
      }
    }
    const start = line.index ?? 0;
    const endingLine = lines[endIndex];
    const end = (endingLine.index ?? 0) + endingLine[0].length;
    spans.push({ start, end, text: raw.slice(start, end) });
    index = endIndex;
  }
  return spans;
}

function fencedCode(raw: string): string[] {
  return fencedCodeSpans(raw).map((span) => span.text);
}

function mathBlocks(raw: string): string[] {
  return [...raw.matchAll(/^\$\$\s*$[\s\S]*?^\$\$\s*$/gmu)].map((match) => match[0]);
}

interface JsonLdBlock extends TextSpan {
  readonly json: string;
}

function jsonLdBlocks(raw: string): JsonLdBlock[] {
  return [...raw.matchAll(/<JsonLd\b[^>]*>\s*\{\s*`(?<json>[\s\S]*?)`\s*\}\s*<\/JsonLd\s*>/gu)].map(
    (match) => ({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      json: match.groups?.json.trim() ?? '',
    }),
  );
}

function withoutProtectedBlocks(raw: string): string {
  let cursor = 0;
  const pieces: string[] = [];
  const spans = [...fencedCodeSpans(raw), ...jsonLdBlocks(raw)].sort(
    (left, right) => left.start - right.start,
  );
  for (const span of spans) {
    pieces.push(raw.slice(cursor, span.start), '\n');
    cursor = span.end;
  }
  pieces.push(raw.slice(cursor));
  return pieces.join('');
}

function inlineCodeSpans(source: string): TextSpan[] {
  const found: TextSpan[] = [];
  for (let index = 0; index < source.length;) {
    if (source[index] !== '`') {
      index += 1;
      continue;
    }
    let delimiterLength = 1;
    while (source[index + delimiterLength] === '`') delimiterLength += 1;
    const delimiter = '`'.repeat(delimiterLength);
    let closing = source.indexOf(delimiter, index + delimiterLength);
    while (
      closing !== -1 &&
      (source[closing - 1] === '`' || source[closing + delimiterLength] === '`')
    ) {
      closing = source.indexOf(delimiter, closing + delimiterLength);
    }
    if (closing === -1) {
      index += delimiterLength;
      continue;
    }
    found.push({
      start: index,
      end: closing + delimiterLength,
      text: source.slice(index + delimiterLength, closing),
    });
    index = closing + delimiterLength;
  }
  return found;
}

function withoutSpans(source: string, spans: readonly TextSpan[]): string {
  let cursor = 0;
  const pieces: string[] = [];
  for (const span of spans) {
    pieces.push(source.slice(cursor, span.start), ' ');
    cursor = span.end;
  }
  pieces.push(source.slice(cursor));
  return pieces.join('');
}

function mdxTagSpans(source: string): TextSpan[] {
  const spans: TextSpan[] = [];
  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== '<' || !/[!/A-Za-z]/u.test(source[start + 1] ?? '')) continue;
    let quote = '';
    let escaped = false;
    for (let index = start + 1; index < source.length; index += 1) {
      const character = source[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (quote) {
        if (character === quote) quote = '';
        continue;
      }
      if (character === '"' || character === "'" || character === '`') {
        quote = character;
        continue;
      }
      if (character !== '>') continue;
      const end = index + 1;
      spans.push({ start, end, text: source.slice(start, end) });
      start = index;
      break;
    }
  }
  return spans;
}

function inlineCode(raw: string): string[] {
  const source = withoutProtectedBlocks(raw);
  return inlineCodeSpans(withoutSpans(source, mdxTagSpans(source))).map((span) => span.text);
}

function figureSources(raw: string): string[] {
  return [
    ...raw.matchAll(
      /<Figure\b[\s\S]*?\bsrc=(?:"(?<double>[^"]+)"|'(?<single>[^']+)')[\s\S]*?\/?\s*>/gu,
    ),
  ].map((match) => match.groups?.double ?? match.groups?.single ?? '');
}

function normalizeLocalizedLink(target: string): string {
  if (target.startsWith('#')) return '#<localized-heading>';
  try {
    const url = new URL(target);
    if (['inferencex.com', 'inferencex.semianalysis.com'].includes(url.hostname)) {
      url.pathname = url.pathname.replace(/^\/zh(?=\/|$)/u, '') || '/';
      return url.toString();
    }
  } catch {
    // Relative URL; normalize its locale prefix below.
  }
  return target.replace(/^\/zh(?=\/|$)/u, '') || '/';
}

function markdownDestination(source: string, start: number, allowEof = false): string | null {
  let index = start;
  while (/[ \t\n\r]/u.test(source[index] ?? '')) index += 1;
  if (source[index] === '<') {
    let target = '';
    for (index += 1; index < source.length; index += 1) {
      if (source[index] === '\\' && index + 1 < source.length) {
        target += source[index + 1];
        index += 1;
      } else if (source[index] === '>') {
        return target;
      } else if (source[index] === '\n' || source[index] === '\r') {
        return null;
      } else {
        target += source[index];
      }
    }
    return null;
  }

  const targetStart = index;
  let depth = 0;
  for (; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (character === '(') {
      depth += 1;
      continue;
    }
    if (character === ')') {
      if (depth === 0) return source.slice(targetStart, index);
      depth -= 1;
      continue;
    }
    if (/\s/u.test(character) && depth === 0) return source.slice(targetStart, index);
  }
  return allowEof && depth === 0 ? source.slice(targetStart) : null;
}

function markdownLinkTargets(raw: string): string[] {
  const targets: string[] = [];
  for (let index = raw.indexOf(']('); index !== -1; index = raw.indexOf('](', index + 2)) {
    const target = markdownDestination(raw, index + 2);
    if (target !== null) targets.push(target);
  }
  for (const match of raw.matchAll(/^ {0,3}\[(?:\\.|[^\]\n])+\]:[ \t]*(?<destination>.*)$/gmu)) {
    const destination = match.groups?.destination ?? '';
    const target = markdownDestination(destination, 0, true);
    if (target !== null) targets.push(target);
  }
  return targets;
}

function linkTargets(raw: string): string[] {
  const markdown = markdownLinkTargets(raw);
  const props = [
    ...raw.matchAll(
      /\b(?:href|src)\s*=\s*(?:"(?<double>[^"]+)"|'(?<single>[^']+)'|\{\s*"(?<expressionDouble>[^"]+)"\s*\}|\{\s*'(?<expressionSingle>[^']+)'\s*\}|\{\s*`(?<expressionTemplate>[^`]+)`\s*\})/gu,
    ),
  ].map(
    (match) =>
      match.groups?.double ??
      match.groups?.single ??
      match.groups?.expressionDouble ??
      match.groups?.expressionSingle ??
      match.groups?.expressionTemplate ??
      '',
  );
  return [...markdown, ...props].map(normalizeLocalizedLink);
}

function jsonLdValues(raw: string): unknown[] {
  const values: unknown[] = [];
  for (const block of jsonLdBlocks(raw)) {
    try {
      values.push(JSON.parse(block.json));
    } catch {
      values.push({ __invalidJsonLd: block.json });
    }
  }
  return values;
}

function invalidJsonLd(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && '__invalidJsonLd' in value);
}

function protectedTokens(raw: string): string[] {
  const withoutBlocks = withoutProtectedBlocks(raw);
  const prose = withoutSpans(withoutBlocks, inlineCodeSpans(withoutBlocks));
  const pattern =
    /--[a-z0-9](?:[\w.-]*[a-z0-9])?(?:=[^\s,，。;；)）`]+)?|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\b(?:tokens?|tok)\/(?:s|sec)(?:\/(?:user|gpu|GPU|chip))?\b|\b[KMGTPE]?FLOP\/s\b|\b[KMGT]?bit\/s\b|\b(?:kW|MW)\/(?:gpu|GPU)\b|\b(?:GPU|chip)\/(?:hr|hour)\b|\b(?:GB\/s|TB\/s|GB|TB|ms|µs|ns|kW|MW)\b|\$\d+(?:\.\d+)?\/M\b|\$\/(?:M\s+(?:tok|tokens?)|(?:GPU|chip)[/-](?:hr|hour))/gu;
  return [...prose.matchAll(pattern)].map((match) =>
    match[0]
      .replace(/^tokens?(?=\/s)/u, 'tok')
      .replace(/^tokens?(?=\/sec)/u, 'tok')
      .replace('/sec', '/s')
      .replace('/GPU', '/gpu')
      .replace(/GPU\/(?:hr|hour)/u, 'gpu/hr')
      .replace(/chip[/-](?:hr|hour)/u, 'chip/hr')
      .replace(/M\s+tokens?$/u, 'M tok'),
  );
}

function jsonShape(value: unknown): unknown {
  if (Array.isArray(value)) return { type: 'array', items: value.map(jsonShape) };
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, jsonShape(child)]),
    );
  }
  return typeof value;
}

function protectedJsonValues(value: unknown): string[] {
  const found: string[] = [];
  const visit = (item: unknown, valuePath = '$'): void => {
    if (Array.isArray(item)) {
      item.forEach((child, index) => visit(child, `${valuePath}[${index}]`));
    } else if (item && typeof item === 'object') {
      Object.entries(item).forEach(([childKey, child]) => visit(child, `${valuePath}.${childKey}`));
    } else if (typeof item === 'number' || typeof item === 'boolean') {
      found.push(`${valuePath}:${JSON.stringify(item)}`);
    } else if (typeof item === 'string') {
      if (valuePath.endsWith('.@type')) found.push(`${valuePath}:${item}`);
      else if (/^https?:\/\//u.test(item)) {
        found.push(`${valuePath}:${normalizeLocalizedLink(item)}`);
      } else if (/^(?:\d{4}-\d{2}-\d{2}|--[a-z0-9-]+|[A-Z][A-Z0-9_]{2,})$/u.test(item)) {
        found.push(`${valuePath}:${item}`);
      }
    }
  };
  visit(value);
  return found.sort();
}

function addDifference(
  violations: GuardViolation[],
  rule: string,
  file: string,
  enValues: readonly unknown[],
  zhValues: readonly unknown[],
): void {
  if (JSON.stringify(enValues) !== JSON.stringify(zhValues)) {
    violations.push({ rule, file });
  }
}

function blogPairSha256(en: string, zh: string): string {
  return createHash('sha256').update(JSON.stringify({ en, zh })).digest('hex');
}

function applyBlogExceptions(
  rule: BlogGuardException['rule'],
  file: string,
  enValues: string[],
  zhValues: string[],
  exceptions: readonly BlogGuardException[],
  pairSha256?: string,
): void {
  const protectedPairAuthorized =
    rule !== 'protected-token' ||
    exceptions.some(
      (item) =>
        item.file === file && item.rule === 'protected-token' && item.pairSha256 === pairSha256,
    );
  for (const exception of exceptions.filter(
    (item) => item.file === file && item.rule === rule && protectedPairAuthorized,
  )) {
    const enIndex = exception.en === '' ? -1 : enValues.indexOf(exception.en);
    const zhIndex = exception.zh === '' ? -1 : zhValues.indexOf(exception.zh);
    const enMatched = exception.en === '' || enIndex !== -1;
    const zhMatched = exception.zh === '' || zhIndex !== -1;
    if (!enMatched || !zhMatched) continue;
    if (enIndex !== -1) enValues.splice(enIndex, 1);
    if (zhIndex !== -1) zhValues.splice(zhIndex, 1);
  }
}

/** Compare objective, non-editorial invariants in one English/Chinese MDX pair. */
export function compareBlogPair(
  file: string,
  en: string,
  zh: string,
  exceptions: readonly BlogGuardException[],
): GuardViolation[] {
  const violations: GuardViolation[] = [];
  addDifference(violations, 'fenced-code', file, fencedCode(en), fencedCode(zh));
  addDifference(violations, 'math', file, mathBlocks(en), mathBlocks(zh));
  addDifference(violations, 'figure-src', file, figureSources(en), figureSources(zh));

  const enInline = inlineCode(en);
  const zhInline = inlineCode(zh);
  applyBlogExceptions('inline-code', file, enInline, zhInline, exceptions);
  if (!multisetsEqual(enInline, zhInline)) violations.push({ rule: 'inline-code', file });
  const enProtected = protectedTokens(en);
  const zhProtected = protectedTokens(zh);
  applyBlogExceptions(
    'protected-token',
    file,
    enProtected,
    zhProtected,
    exceptions,
    blogPairSha256(en, zh),
  );
  if (!multisetsEqual(enProtected, zhProtected)) {
    violations.push({
      rule: 'protected-token',
      file,
      detail: `missingFromZh=${JSON.stringify(multisetRemainder(enProtected, zhProtected))} missingFromEn=${JSON.stringify(multisetRemainder(zhProtected, enProtected))}`,
    });
  }
  if (!multisetsEqual(linkTargets(en), linkTargets(zh))) {
    violations.push({ rule: 'link-target', file });
  }

  const enJson = jsonLdValues(en);
  const zhJson = jsonLdValues(zh);
  if (enJson.some(invalidJsonLd) || zhJson.some(invalidJsonLd)) {
    violations.push({ rule: 'json-ld-syntax', file });
  }
  addDifference(violations, 'json-ld-shape', file, enJson.map(jsonShape), zhJson.map(jsonShape));
  addDifference(
    violations,
    'json-ld-protected-value',
    file,
    enJson.flatMap(protectedJsonValues),
    zhJson.flatMap(protectedJsonValues),
  );
  return violations;
}

function mdxChineseSegments(source: string): string[] {
  const literals = (source.match(STRING_LITERAL) ?? []).filter((text) => HAN.test(text));
  const visible = source
    .replaceAll(STRING_LITERAL, 'X')
    .replaceAll(/<[^>]*>/gsu, '')
    .split('\n')
    .filter((text) => HAN.test(text));
  return [...literals, ...visible];
}

function chineseSegments(file: string, source: string): string[] {
  if (!HAN.test(source)) return [];
  if (file.endsWith('.mdx')) return mdxChineseSegments(source);

  const sourceFile = parseSource(file, source);
  const segments: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isJsxText(node) ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail
    ) {
      const text = node.getText(sourceFile);
      if (HAN.test(text)) segments.push(text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return segments.length > 0 ? segments : [source];
}

/** High-confidence copy checks only; no fluency, clause-order, register, or pronoun heuristics. */
export function findMechanicalCopyViolations(file: string, source: string): GuardViolation[] {
  const violations: GuardViolation[] = [];
  const scanSource = file.endsWith('.mdx') ? withoutProtectedBlocks(source) : source;
  for (const text of chineseSegments(file, scanSource)) {
    const withoutUnits = text.replaceAll(CHIP_UNIT, '');
    if (/\b[Cc]hip\b/gu.test(withoutUnits)) {
      violations.push({ rule: 'chip-untranslated', file });
    }
    if (
      /\b(?:warmup(?:\s+预热|\s*[（(]\s*预热\s*[）)])|seed(?:\s+随机种子|\s*[（(]\s*随机种子\s*[）)])|offload(?:\s+卸载|\s*[（(]\s*卸载\s*[）)]))/iu.test(
        text,
      )
    ) {
      violations.push({ rule: 'duplicated-technical-loanword', file });
    }
    if (/\s+[，。！？；：]|(?:,，|，,|\.。|。\.)/u.test(text)) {
      violations.push({
        rule: 'malformed-chinese-punctuation',
        file,
        detail: text.replaceAll(/\s+/gu, ' ').trim().slice(0, 160),
      });
    }
  }
  if (countLocaleDictionaryObjects(file, source) > 0) {
    const labels = [...source.matchAll(/<strong>(?<label>[A-Za-z][^<${}]{2,45}):<\/strong>/gu)]
      .map((match) => match.groups?.label ?? '')
      .filter((label) => !label.includes('/') && !/^[A-Z0-9]+$/u.test(label));
    if (labels.length > 0) violations.push({ rule: 'hardcoded-english-label', file });
  }
  return violations;
}

export function findBlogPairViolations(
  englishFiles: readonly string[],
  chineseFiles: readonly string[],
): GuardViolation[] {
  const en = new Set(englishFiles);
  const zh = new Set(chineseFiles);
  return [
    ...[...en]
      .filter((file) => !zh.has(file))
      .map((file) => ({ rule: 'blog-sibling', file, detail: 'missing Simplified Chinese post' })),
    ...[...zh]
      .filter((file) => !en.has(file))
      .map((file) => ({ rule: 'blog-sibling', file, detail: 'orphan Simplified Chinese post' })),
  ].sort((a, b) => (a.file ?? '').localeCompare(b.file ?? ''));
}
