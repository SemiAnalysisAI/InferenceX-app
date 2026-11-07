import ts from 'typescript';

export interface HardwareLiteral {
  line: number;
  text: string;
}

/** Matches a key not preceded or followed by a letter or digit, so `b200` misses `gb200`. */
export function hardwareKeyPattern(keys: Iterable<string>): RegExp {
  const alternatives = [...keys]
    .sort((a, b) => b.length - a.length)
    .map((key) => key.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`))
    .join('|');
  return new RegExp(`(?<![A-Za-z0-9])(?:${alternatives})(?![A-Za-z0-9])`, 'gu');
}

function isModuleSpecifier(node: ts.Node): boolean {
  const { parent } = node;
  return (
    (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
    parent.moduleSpecifier === node
  );
}

/**
 * Property names count as keys because `{ h100: 1 }`, `{ 'h100': 1 }`, `x.h100` and `x['h100']`
 * are the same lookup, and the formatter may rewrite one form into another.
 */
function isPropertyName(node: ts.Identifier): boolean {
  const { parent } = node;
  return (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertyAccessExpression(parent)) &&
    parent.name === node
  );
}

/**
 * Hardware keys inside string literals, template text and property names. Comments, JSX text
 * and import paths are not code that selects hardware.
 */
export function scanHardwareLiterals(
  fileName: string,
  source: string,
  keys: ReadonlySet<string>,
  pattern: RegExp,
): HardwareLiteral[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const found: HardwareLiteral[] = [];
  const record = (node: ts.Node, text: string, count: number) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
    for (let i = 0; i < count; i++) found.push({ line: line + 1, text });
  };
  const visit = (node: ts.Node) => {
    if (
      (ts.isStringLiteral(node) && !isModuleSpecifier(node)) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      record(node, node.text, [...node.text.matchAll(pattern)].length);
    } else if (ts.isIdentifier(node) && keys.has(node.text) && isPropertyName(node)) {
      record(node, node.text, 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

export type HardwareLiteralCounts = Record<string, number>;

export function compareToBaseline(
  counts: HardwareLiteralCounts,
  baseline: HardwareLiteralCounts,
): { grown: string[]; shrunk: string[] } {
  const files = [...new Set([...Object.keys(counts), ...Object.keys(baseline)])].sort();
  return {
    grown: files.filter((file) => (counts[file] ?? 0) > (baseline[file] ?? 0)),
    shrunk: files.filter((file) => (counts[file] ?? 0) < (baseline[file] ?? 0)),
  };
}
