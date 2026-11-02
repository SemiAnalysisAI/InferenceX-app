import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(import.meta.dirname, '../..');

/** Analytics calls and the index of their properties argument. */
const TRACKING_CALLS: Record<string, number> = {
  track: 1,
  trackOncePerPageview: 1,
  trackOncePerSession: 1,
  trackServer: 1,
  useDialogCloseTracking: 2,
  useSearchTracking: 2,
};

/** Keys replaced by a canonical name (see "Analytics" in docs/architecture.md). */
const LEGACY_KEYS: Record<string, string> = {
  hw: 'gpu',
  hwKey: 'gpu',
  hw_key: 'gpu',
  hardware: 'gpu',
  sku: 'gpu',
  gpu_a: 'gpus',
  gpu_b: 'gpus',
  dir: 'sort_dir',
  expanded: 'enabled',
  visible: 'enabled',
  checked: 'enabled',
  open: 'enabled',
};

function propertyKeys(file: string): { key: string; line: number }[] {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const keys: { key: string; line: number }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const index = TRACKING_CALLS[node.expression.text];
      const argument = index === undefined ? undefined : node.arguments[index];
      if (argument && ts.isObjectLiteralExpression(argument)) {
        for (const property of argument.properties) {
          if (!property.name || !ts.isIdentifier(property.name)) continue;
          const { line } = source.getLineAndCharacterOfPosition(property.getStart(source));
          keys.push({ key: property.name.text, line: line + 1 });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return keys;
}

describe('analytics event property keys', () => {
  it('uses canonical snake_case keys in every tracking call', () => {
    const offenders: string[] = [];
    for (const entry of readdirSync(SRC, { recursive: true, encoding: 'utf8' })) {
      if (!/\.tsx?$/u.test(entry) || /\.test\.tsx?$/u.test(entry)) continue;
      for (const { key, line } of propertyKeys(path.join(SRC, entry))) {
        if (/[A-Z]/u.test(key)) offenders.push(`${entry}:${line} ${key} is not snake_case`);
        else if (key in LEGACY_KEYS) {
          offenders.push(`${entry}:${line} ${key} should be ${LEGACY_KEYS[key]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
