import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const here = import.meta.dirname;

/** Static (non-type) import specifiers in a module; dynamic `import()` is excluded. */
function staticImports(file: string): string[] {
  const text = readFileSync(path.join(here, file), 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return source.statements
    .filter(ts.isImportDeclaration)
    .filter((node) => !node.importClause?.isTypeOnly)
    .map((node) => (node.moduleSpecifier as ts.StringLiteral).text);
}

describe('site search bundle isolation', () => {
  // Every page ships the header. The index, crawler and dialog must stay in a
  // lazily loaded chunk so search costs nothing until a user opens it.
  it('keeps the dialog and search engine out of the header bundle', () => {
    for (const file of ['header.tsx', 'site-search-button.tsx']) {
      const specifiers = staticImports(file);
      expect(specifiers.filter((s) => s.includes('site-search-dialog'))).toEqual([]);
      expect(specifiers.filter((s) => s.startsWith('@/lib/site-search'))).toEqual([]);
    }
  });

  it('loads the dialog through a dynamic import', () => {
    const text = readFileSync(path.join(here, 'site-search-button.tsx'), 'utf8');
    expect(text).toMatch(/import\(\s*'\.\/site-search-dialog'\s*\)/u);
  });
});
