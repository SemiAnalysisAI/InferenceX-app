import path from 'node:path';

import { createProcessor } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import ts from 'typescript';

export interface GuardViolation {
  readonly rule: string;
  readonly file?: string;
  readonly route?: string;
  readonly detail?: string;
  readonly missingFromEn?: readonly string[];
  readonly missingFromZh?: readonly string[];
}

/** Intentional one-sided pages, separated so a waiver cannot hide the opposite direction. */
export interface RouteParityExceptions {
  readonly englishOnly?: ReadonlySet<string>;
  readonly chineseOnly?: ReadonlySet<string>;
}

interface MdxPosition {
  readonly start: { readonly offset?: number };
  readonly end: { readonly offset?: number };
}

interface MdxExpressionValue {
  readonly type: string;
  readonly value: string;
}

interface MdxAttribute {
  readonly type: string;
  readonly name?: string;
  readonly value?: string | MdxExpressionValue | null;
  readonly position?: MdxPosition;
}

interface MdxNode {
  readonly type: string;
  readonly name?: string | null;
  readonly value?: string;
  readonly url?: string;
  readonly identifier?: string;
  readonly attributes?: readonly MdxAttribute[];
  readonly children?: readonly MdxNode[];
  readonly position?: MdxPosition;
}

interface JsonLdValue {
  readonly valid: boolean;
  readonly value?: unknown;
}

interface BlogStructure {
  readonly code: readonly string[];
  readonly inlineCode: readonly string[];
  readonly math: readonly string[];
  readonly figureSources: readonly string[];
  readonly links: readonly string[];
  readonly jsonLd: readonly JsonLdValue[];
}

const MDX_PROCESSOR = createProcessor({
  format: 'mdx',
  remarkPlugins: [remarkGfm, [remarkMath, { singleDollarTextMath: false }]],
});

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
  exceptions: RouteParityExceptions = {},
): GuardViolation[] {
  const en = new Set<string>();
  const zh = new Set<string>();
  for (const file of pageFiles) {
    const page = pageRoute(file);
    if (!page) continue;
    (page.locale === 'zh' ? zh : en).add(page.route);
  }

  return [
    ...[...en]
      .filter((route) => !zh.has(route) && !exceptions.englishOnly?.has(route))
      .map((route) => ({
        rule: 'route-sibling',
        route,
        detail: 'missing Simplified Chinese page',
      })),
    ...[...zh]
      .filter((route) => !en.has(route) && !exceptions.chineseOnly?.has(route))
      .map((route) => ({
        rule: 'route-sibling',
        route,
        detail: 'orphan Simplified Chinese page',
      })),
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
      const next = prefix ? `${prefix}[]` : '[]';
      for (const nested of structuralPaths(element, next)) paths.add(nested);
    }
  }
  return paths;
}

function parseSource(file: string, source: string): ts.SourceFile {
  if (file.endsWith('.json')) return ts.parseJsonText(file, source);
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
}

/** Find direct object-literal `en` / `zh` siblings and compare their explicit key shape. */
export function findDictionaryParityViolations(file: string, source: string): GuardViolation[] {
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
  return violations;
}

/** Ordered raw initializers retain distinct dictionary identity and catch cross-dictionary swaps. */
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
  return found;
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
 * Chinese-only mode protects complete English MDX files and ordered raw `en` initializers.
 * Locale-neutral code and Chinese subtrees deliberately remain outside this comparison.
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

function nodeSource(node: { readonly position?: MdxPosition }, source: string): string {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined ? '' : source.slice(start, end);
}

function staticStringExpression(expression: string): string | null {
  const sourceFile = ts.createSourceFile(
    'mdx-static-expression.tsx',
    `const __value = (${expression});`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const statement = sourceFile.statements[0];
  if (!statement || !ts.isVariableStatement(statement)) return null;
  const initializer = statement.declarationList.declarations[0]?.initializer;
  if (!initializer) return null;
  const value = unwrapExpression(initializer);
  return ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value) ? value.text : null;
}

function attributeValue(attribute: MdxAttribute): string | null {
  if (typeof attribute.value === 'string') return attribute.value;
  if (attribute.value && typeof attribute.value.value === 'string') {
    return staticStringExpression(attribute.value.value);
  }
  return null;
}

function normalizeLocalizedLink(target: string): string {
  if (target.startsWith('#')) return '#<localized-heading>';

  const hashIndex = target.indexOf('#');
  const destination = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const normalizedHash = hashIndex === -1 ? '' : '#<localized-heading>';
  try {
    const url = new URL(destination);
    if (!['inferencex.com', 'inferencex.semianalysis.com'].includes(url.hostname)) return target;
    url.pathname = url.pathname.replace(/^\/zh(?=\/|$)/u, '') || '/';
    url.hash = normalizedHash;
    return url.toString();
  } catch {
    return `${destination.replace(/^\/zh(?=\/|$)/u, '') || '/'}${normalizedHash}`;
  }
}

function walkMdx(node: MdxNode, visit: (node: MdxNode) => void): void {
  visit(node);
  node.children?.forEach((child) => walkMdx(child, visit));
}

function linkDefinitions(root: MdxNode): Map<string, string> {
  const definitions = new Map<string, string>();
  walkMdx(root, (node) => {
    if (node.type === 'definition' && node.identifier && node.url) {
      definitions.set(node.identifier.toLowerCase(), node.url);
    }
  });
  return definitions;
}

function jsonLdValue(node: MdxNode): JsonLdValue {
  const expression = node.children?.find(
    (child) => child.type === 'mdxFlowExpression' || child.type === 'mdxTextExpression',
  );
  const raw = expression?.value ? staticStringExpression(expression.value) : null;
  if (raw === null) return { valid: false };
  try {
    return { valid: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { valid: false };
  }
}

function collectBlogStructure(source: string): BlogStructure {
  const root = MDX_PROCESSOR.parse(source) as unknown as MdxNode;
  const definitions = linkDefinitions(root);
  const code: string[] = [];
  const inlineCode: string[] = [];
  const math: string[] = [];
  const figureSources: string[] = [];
  const links: string[] = [];
  const jsonLd: JsonLdValue[] = [];

  walkMdx(root, (node) => {
    if (node.type === 'code') code.push(nodeSource(node, source));
    if (node.type === 'inlineCode' && node.value !== undefined) inlineCode.push(node.value);
    if (node.type === 'math' || node.type === 'inlineMath') math.push(nodeSource(node, source));
    if ((node.type === 'link' || node.type === 'image') && node.url) links.push(node.url);
    if ((node.type === 'linkReference' || node.type === 'imageReference') && node.identifier) {
      const destination = definitions.get(node.identifier.toLowerCase());
      if (destination) links.push(destination);
    }
    if (node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') return;

    for (const attribute of node.attributes ?? []) {
      if (attribute.type !== 'mdxJsxAttribute' || !attribute.name) continue;
      const value = attributeValue(attribute);
      if (node.name === 'Figure' && attribute.name === 'src') {
        figureSources.push(value ?? nodeSource(attribute, source));
      }
      if ((attribute.name === 'href' || attribute.name === 'src') && value !== null) {
        links.push(value);
      }
    }
    if (node.name === 'JsonLd') jsonLd.push(jsonLdValue(node));
  });

  return {
    code,
    inlineCode,
    math,
    figureSources,
    links: links.map(normalizeLocalizedLink).sort(),
    jsonLd,
  };
}

function missingMultisetValues(required: readonly string[], actual: readonly string[]): string[] {
  const remaining = new Map<string, number>();
  actual.forEach((value) => remaining.set(value, (remaining.get(value) ?? 0) + 1));
  return required.filter((value) => {
    const count = remaining.get(value) ?? 0;
    if (count === 0) return true;
    remaining.set(value, count - 1);
    return false;
  });
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
      Object.entries(item).forEach(([key, child]) => visit(child, `${valuePath}.${key}`));
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

/** Compare objective structural invariants in one English/Chinese MDX pair. */
export function compareBlogPair(file: string, en: string, zh: string): GuardViolation[] {
  let enStructure: BlogStructure;
  let zhStructure: BlogStructure;
  try {
    enStructure = collectBlogStructure(en);
  } catch (error) {
    return [{ rule: 'mdx-syntax', file, detail: `English MDX: ${String(error)}` }];
  }
  try {
    zhStructure = collectBlogStructure(zh);
  } catch (error) {
    return [{ rule: 'mdx-syntax', file, detail: `Chinese MDX: ${String(error)}` }];
  }

  const violations: GuardViolation[] = [];
  addDifference(violations, 'fenced-code', file, enStructure.code, zhStructure.code);
  if (missingMultisetValues(enStructure.inlineCode, zhStructure.inlineCode).length > 0) {
    violations.push({ rule: 'inline-code', file });
  }
  addDifference(violations, 'math', file, enStructure.math, zhStructure.math);
  addDifference(
    violations,
    'figure-src',
    file,
    enStructure.figureSources,
    zhStructure.figureSources,
  );
  addDifference(violations, 'link-target', file, enStructure.links, zhStructure.links);

  if (
    enStructure.jsonLd.some((item) => !item.valid) ||
    zhStructure.jsonLd.some((item) => !item.valid)
  ) {
    violations.push({ rule: 'json-ld-syntax', file });
  }
  const enJson = enStructure.jsonLd.filter((item) => item.valid).map((item) => item.value);
  const zhJson = zhStructure.jsonLd.filter((item) => item.valid).map((item) => item.value);
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
