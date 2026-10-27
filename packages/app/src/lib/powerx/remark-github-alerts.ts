import type { Blockquote, Parent, Root } from 'mdast';

/** GitHub alert kinds, as written in `> [!NOTE]` on the first line of a blockquote. */
export const GITHUB_ALERT_KINDS = ['note', 'tip', 'important', 'warning', 'caution'] as const;
export type GitHubAlertKind = (typeof GITHUB_ALERT_KINDS)[number];

const MARKER = /^\[!(?<kind>NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n|$)/u;

function hasChildren(node: unknown): node is Parent {
  return typeof node === 'object' && node !== null && Array.isArray((node as Parent).children);
}

function convertAlert(blockquote: Blockquote): void {
  const [paragraph] = blockquote.children;
  if (paragraph?.type !== 'paragraph') return;
  const [text] = paragraph.children;
  if (text?.type !== 'text') return;
  const match = MARKER.exec(text.value);
  if (!match?.groups) return;

  const kind = match.groups.kind.toLowerCase() as GitHubAlertKind;
  text.value = text.value.slice(match[0].length);
  if (text.value === '') paragraph.children.shift();
  if (paragraph.children.length === 0) blockquote.children.shift();
  blockquote.data = { ...blockquote.data, hName: 'aside', hProperties: { 'data-callout': kind } };
}

function walk(node: Parent): void {
  for (const child of node.children) {
    if (child.type === 'blockquote') convertAlert(child);
    if (hasChildren(child)) walk(child);
  }
}

/**
 * Turns GitHub-flavoured alert blockquotes (`> [!TIP]`) into `aside[data-callout]` elements so the
 * same `.md` file renders as a callout in the app and as a native alert on GitHub. Plain
 * blockquotes are left untouched.
 */
export function remarkGithubAlerts() {
  return (tree: Root) => {
    walk(tree);
  };
}
