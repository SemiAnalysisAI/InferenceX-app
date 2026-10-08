import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { APP_THEMES } from './themes';

const src = path.resolve(import.meta.dirname, '..');
const optionalThemes = APP_THEMES.filter((theme) => !['light', 'dark', 'system'].includes(theme));
const optionalDirectory = new RegExp(`^components/(?:${optionalThemes.join('|')})/`);
// These wrappers contain only activation gates and dynamic imports.
const wrappers = new Set([
  'components/minecraft/minecraft-splash.tsx',
  'components/minecraft/minecraft-toggles-lazy.tsx',
  'components/halo/halo-toggles-lazy.tsx',
]);
const engine = /^(?:three|@react-three\/[^/]+|@dimforge\/rapier[^/]*)(?:\/|$)/;
const optionalAsset = new RegExp(
  `(?:/decorative/(?:${optionalThemes.join('|')})/|minecraft-click\\.mp3|Monocraft-|Pricedown|ChaletComprime|Industry-|halo[^/]*\\.(?:woff2?|ttf|otf|mp3|ogg|wav))`,
  'i',
);

/** Static runtime imports, including re-exports. Dynamic imports stay behind their gate. */
function imports(text: string): string[] {
  const file = ts.createSourceFile(
    'module.tsx',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const result: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const typeOnly = ts.isImportDeclaration(node)
        ? node.importClause?.isTypeOnly ||
          (!node.importClause?.name &&
            node.importClause?.namedBindings &&
            ts.isNamedImports(node.importClause.namedBindings) &&
            node.importClause.namedBindings.elements.length > 0 &&
            node.importClause.namedBindings.elements.every((element) => element.isTypeOnly))
        : node.isTypeOnly ||
          (node.exportClause &&
            ts.isNamedExports(node.exportClause) &&
            node.exportClause.elements.length > 0 &&
            node.exportClause.elements.every((element) => element.isTypeOnly));
      if (!typeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
        result.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      result.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return result;
}

function resolve(from: string, specifier: string): string | undefined {
  const base = specifier.startsWith('@/')
    ? path.join(src, specifier.slice(2))
    : specifier.startsWith('.')
      ? path.resolve(path.dirname(from), specifier)
      : undefined;
  if (!base) return;
  return ['', '.ts', '.tsx', '.js', '.jsx', '.css', '/index.ts', '/index.tsx']
    .map((extension) => base + extension)
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function routeEntries(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'api' ? [] : routeEntries(file);
    return /^(?:page|layout|loading|error|not-found|template|global-error)\.tsx?$/.test(entry.name)
      ? [file]
      : [];
  });
}

describe('optional theme import boundary', () => {
  it('follows static imports, re-exports and require without crossing dynamic boundaries', () => {
    expect(
      imports(`
        import 'a.css';
        import Theme from './theme';
        import type { ThemeType } from './types';
        import { type AnotherType } from './types';
        export { x } from './barrel';
        export * from './other';
        export type { Y } from './types';
        export { type Z } from './types';
        const a = require('./legacy');
        const b = () => import('./lazy');
      `),
    ).toEqual(['a.css', './theme', './barrel', './other', './legacy']);
  });

  it('keeps every page and shared layout free of eager optional code, engines and asset CSS', () => {
    const roots = routeEntries(path.join(src, 'app'));
    expect(roots.length).toBeGreaterThan(20);
    const queue = roots.map((file) => ({ file, chain: [path.relative(src, file)] }));
    const seen = new Set<string>();
    const violations: string[] = [];
    for (const { file, chain } of queue) {
      if (seen.has(file)) continue;
      seen.add(file);
      const relative = path.relative(src, file).replaceAll(path.sep, '/');
      if (optionalDirectory.test(relative) && !wrappers.has(relative))
        violations.push(chain.join(' → '));
      const text = readFileSync(file, 'utf8');
      const dependencies = file.endsWith('.css')
        ? [...text.matchAll(/@import\s+['"](?<url>[^'"]+)['"]/g)].map((match) => match.groups!.url)
        : imports(text);
      // Palette variables and hiding rules may remain shared; asset/font loads may not.
      if (file.endsWith('.css')) {
        for (const match of text.matchAll(/(?:url\([^)]*\)|@font-face\s*\{[^}]*\})/g))
          if (optionalAsset.test(match[0])) violations.push(`${chain.join(' → ')}: ${match[0]}`);
      }
      for (const dependency of dependencies) {
        if (engine.test(dependency)) violations.push([...chain, dependency].join(' → '));
        const resolved = resolve(file, dependency);
        if (resolved)
          queue.push({ file: resolved, chain: [...chain, path.relative(src, resolved)] });
      }
    }
    expect(seen.has(path.join(src, 'components/easter-egg-theme-lazy.tsx'))).toBe(true);
    expect(seen.has(path.join(src, 'app/globals.css'))).toBe(true);
    expect(violations, 'Move these imports behind an explicit theme/game activation gate').toEqual(
      [],
    );
  });
});
