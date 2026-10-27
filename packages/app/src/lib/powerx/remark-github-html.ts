import type { Node, Parent, Root } from 'mdast';

/** The HTML tags GitHub-flavoured markdown may use in the tutorial; everything else stays text. */
export const GITHUB_HTML_TAGS = ['details', 'summary', 'kbd', 'br'] as const;
type GitHubHtmlTag = (typeof GITHUB_HTML_TAGS)[number];

const VOID_TAGS: ReadonlySet<string> = new Set(['br']);
const TOKEN = /<(?<close>\/?)(?<tag>details|summary|kbd|br)\b[^>]*>|[^<]+|<[^<]*/giu;

interface ElementNode extends Node {
  type: 'githubElement';
  children: Node[];
  data: { hName: GitHubHtmlTag };
}

function element(tag: GitHubHtmlTag): ElementNode {
  return { type: 'githubElement', children: [], data: { hName: tag } };
}

function hasChildren(node: Node): node is Parent {
  return Array.isArray((node as Parent).children);
}

function transform(parent: Parent): void {
  const out: Node[] = [];
  const stack: ElementNode[] = [];
  const push = (node: Node) => (stack.at(-1)?.children ?? out).push(node);

  for (const child of parent.children) {
    if (hasChildren(child)) transform(child);
    if (child.type !== 'html') {
      push(child);
      continue;
    }
    for (const token of (child as { value: string }).value.matchAll(TOKEN)) {
      const tag = token.groups?.tag?.toLowerCase() as GitHubHtmlTag | undefined;
      if (!tag) {
        if (token[0].trim() !== '') push({ type: 'text', value: token[0] } as Node);
      } else if (VOID_TAGS.has(tag)) {
        push(element(tag));
      } else if (token.groups?.close) {
        if (stack.some((node) => node.data.hName === tag)) {
          let open = stack.pop()!;
          while (open.data.hName !== tag) {
            const outer = stack.pop()!;
            outer.children.push(open);
            open = outer;
          }
          push(open);
        }
      } else {
        stack.push(element(tag));
      }
    }
  }
  for (const unclosed of stack) out.push(unclosed);
  parent.children = out as Parent['children'];
}

/**
 * Rebuilds the `<details>`, `<summary>`, `<kbd>` and `<br>` HTML that GitHub renders natively as
 * real elements, because MDX's plain-markdown mode drops raw HTML. Markdown between the tags is
 * kept as ordinary children, so `<details>` bodies may hold paragraphs, lists and code.
 */
export function remarkGithubHtml() {
  return (tree: Root) => {
    transform(tree);
  };
}
