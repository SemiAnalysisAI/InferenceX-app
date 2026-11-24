export type LabelSplitMode = 'last-space' | 'newline' | 'parens';

export function splitLabel(label: string, mode: LabelSplitMode): [string, string | null] {
  if (mode === 'newline') {
    const idx = label.indexOf('\n');
    if (idx === -1) return [label, null];
    return [label.slice(0, idx), label.slice(idx + 1).replaceAll('\n', ' ')];
  }
  if (mode === 'parens') {
    const match = label.match(/^(?<base>.+?)(?<suffix>\s*\(.+\))$/u);
    if (!match) return [label, null];
    return [match[1], match[2].trim()];
  }
  const lastSpace = label.lastIndexOf(' ');
  if (lastSpace <= 0) return [label, null];
  return [label.slice(0, lastSpace), label.slice(lastSpace + 1)];
}
