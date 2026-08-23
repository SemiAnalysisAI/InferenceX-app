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

export interface BlogGuardException {
  readonly rule: 'inline-code';
  readonly file: string;
  readonly en: string;
  readonly zh: string;
  readonly reason: string;
  readonly removeWhen: string;
}

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
      if (!ts.isPropertyAssignment(property)) continue;
      const key = propertyName(property.name);
      if (!key) continue;
      const next = prefix ? `${prefix}.${key}` : key;
      paths.add(next);
      for (const nested of structuralPaths(property.initializer, next)) paths.add(nested);
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
  let enObjectCount = 0;
  let zhObjectCount = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const en = propertyInitializer(node, 'en');
      const zh = propertyInitializer(node, 'zh');
      if (en && ts.isObjectLiteralExpression(en)) enObjectCount += 1;
      if (zh && ts.isObjectLiteralExpression(zh)) zhObjectCount += 1;
      if (en && zh && ts.isObjectLiteralExpression(en) && ts.isObjectLiteralExpression(zh)) {
        const enPaths = structuralPaths(en);
        const zhPaths = structuralPaths(zh);
        const missingFromEn = [...zhPaths].filter((key) => !enPaths.has(key)).sort();
        const missingFromZh = [...enPaths].filter((key) => !zhPaths.has(key)).sort();
        if (missingFromEn.length > 0 || missingFromZh.length > 0) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
          violations.push({
            rule: 'dictionary-key-parity',
            file: `${file}:${line}`,
            missingFromEn,
            missingFromZh,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (enObjectCount !== zhObjectCount) {
    violations.push({
      rule: 'dictionary-locale-count',
      file,
      detail: `${enObjectCount} en object(s), ${zhObjectCount} zh object(s)`,
    });
  }
  return violations.filter(
    (violation) =>
      !exceptions.some(
        (exception) =>
          normalizedFile(file).endsWith(exception.file) &&
          dictionaryViolationFingerprint(violation) === exception.mismatchSha256,
      ),
  );
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

function fencedCode(raw: string): string[] {
  return [...raw.matchAll(/^```[^\n]*\n[\s\S]*?^```\s*$/gmu)].map((match) => match[0]);
}

function mathBlocks(raw: string): string[] {
  return [...raw.matchAll(/^\$\$\s*$[\s\S]*?^\$\$\s*$/gmu)].map((match) => match[0]);
}

function withoutProtectedBlocks(raw: string): string {
  return raw
    .replaceAll(/^```[^\n]*\n[\s\S]*?^```\s*$/gmu, '')
    .replaceAll(/<JsonLd>\{`[\s\S]*?`\}<\/JsonLd>/gu, '');
}

function inlineCode(raw: string): string[] {
  return [...withoutProtectedBlocks(raw).matchAll(/(?<!`)`(?<code>[^`\n]+)`(?!`)/gu)].map(
    (match) => match.groups?.code ?? '',
  );
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

function linkTargets(raw: string): string[] {
  return [...raw.matchAll(/\]\((?<target>[^)\s]+)(?:\s+"[^"]*")?\)/gu)].map((match) =>
    normalizeLocalizedLink(match.groups?.target ?? ''),
  );
}

function jsonLdValues(raw: string): unknown[] {
  const values: unknown[] = [];
  for (const match of raw.matchAll(/<JsonLd>\{`(?<json>\{[\s\S]*?\})`\}<\/JsonLd>/gu)) {
    try {
      values.push(JSON.parse(match.groups?.json ?? ''));
    } catch {
      values.push({ __invalidJsonLd: match.groups?.json ?? '' });
    }
  }
  return values;
}

function invalidJsonLd(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && '__invalidJsonLd' in value);
}

function protectedTokens(raw: string): string[] {
  const prose = withoutProtectedBlocks(raw);
  const pattern =
    /--[a-z0-9][\w.-]*(?:=[^\s,，。;；)）`]+)?|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\b(?:tokens?\/s(?:\/(?:user|gpu|GPU|chip))?|GB\/s|TB\/s|GB|TB|ms|µs|ns|kW|MW)\b|\$\/(?:M\s+tok|chip-hour)/gu;
  return [...prose.matchAll(pattern)].map((match) =>
    match[0].replace(/^tokens?(?=\/s)/u, 'tok').replace('/GPU', '/gpu'),
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
  const visit = (item: unknown, key = ''): void => {
    if (Array.isArray(item)) {
      item.forEach((child) => visit(child, key));
    } else if (item && typeof item === 'object') {
      Object.entries(item).forEach(([childKey, child]) => visit(child, childKey));
    } else if (typeof item === 'number' || typeof item === 'boolean') {
      found.push(`${key}:${JSON.stringify(item)}`);
    } else if (typeof item === 'string') {
      if (key === '@type') found.push(`${key}:${item}`);
      else if (/^https?:\/\//u.test(item)) found.push(`${key}:${normalizeLocalizedLink(item)}`);
      else if (/^(?:\d{4}-\d{2}-\d{2}|--[a-z0-9-]+|[A-Z][A-Z0-9_]{2,})$/u.test(item)) {
        found.push(`${key}:${item}`);
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
  for (const exception of exceptions.filter((item) => item.file === file)) {
    const enIndex = enInline.indexOf(exception.en);
    const zhIndex = zhInline.indexOf(exception.zh);
    if (enIndex !== -1 && zhIndex !== -1) {
      enInline.splice(enIndex, 1);
      zhInline.splice(zhIndex, 1);
    }
  }
  if (!multisetsEqual(enInline, zhInline)) violations.push({ rule: 'inline-code', file });
  const zhProtected = new Set(protectedTokens(zh));
  if (![...new Set(protectedTokens(en))].every((token) => zhProtected.has(token))) {
    violations.push({ rule: 'protected-token', file });
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

function chineseSegments(source: string): string[] {
  if (!HAN.test(source)) return [];
  const literals = (source.match(STRING_LITERAL) ?? []).filter((text) => HAN.test(text));
  return literals.length > 0 ? literals : [source];
}

/** High-confidence copy checks only; no fluency, clause-order, register, or pronoun heuristics. */
export function findMechanicalCopyViolations(file: string, source: string): GuardViolation[] {
  const violations: GuardViolation[] = [];
  const scanSource = file.endsWith('.mdx') ? withoutProtectedBlocks(source) : source;
  for (const text of chineseSegments(scanSource)) {
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
      violations.push({ rule: 'malformed-chinese-punctuation', file });
    }
  }
  if (/\bzh:\s*\{/u.test(source)) {
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
