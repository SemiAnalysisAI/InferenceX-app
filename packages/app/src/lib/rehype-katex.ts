import { fromHtmlIsomorphic } from 'hast-util-from-html-isomorphic';
import { toText } from 'hast-util-to-text';
import katex, { type KatexOptions } from 'katex';
import { SKIP, visitParents } from 'unist-util-visit-parents';
import type { VFile } from 'vfile';

type Options = Omit<KatexOptions, 'displayMode' | 'throwOnError'>;
type HastNode = Parameters<typeof toText>[0];
type Root = Extract<HastNode, { type: 'root' }>;
type ElementContent = Extract<HastNode, { type: 'element' }>['children'][number];

function parseKaTeXHtml(html: string): ElementContent[] {
  return fromHtmlIsomorphic(html, { fragment: true }).children.filter(
    (child: HastNode): child is ElementContent => child.type !== 'doctype',
  );
}

const EMPTY_OPTIONS: Readonly<Options> = {};
const EMPTY_CLASSES: readonly unknown[] = [];

/**
 * Render the math nodes produced by remark-math with the app's direct KaTeX version.
 * rehype-katex 7 is intentionally not used because it pins KaTeX 0.16 and emits
 * layout classes that do not match the KaTeX 0.18 stylesheet.
 */
export function rehypeKatex(options?: Readonly<Options> | null) {
  const settings = options ?? EMPTY_OPTIONS;

  return (tree: Root, file: VFile) => {
    visitParents(tree, 'element', (element, parents) => {
      const classes = Array.isArray(element.properties.className)
        ? element.properties.className
        : EMPTY_CLASSES;
      const languageMath = classes.includes('language-math');
      const mathDisplay = classes.includes('math-display');
      const mathInline = classes.includes('math-inline');
      let displayMode = mathDisplay;

      if (!languageMath && !mathDisplay && !mathInline) return;

      let parent = parents.at(-1);
      let scope = element;

      if (
        element.tagName === 'code' &&
        languageMath &&
        parent?.type === 'element' &&
        parent.tagName === 'pre'
      ) {
        scope = parent;
        parent = parents.at(-2);
        displayMode = true;
      }

      if (!parent) return;

      const value = toText(scope, { whitespace: 'pre' });
      let result: ElementContent[];

      try {
        result = parseKaTeXHtml(
          katex.renderToString(value, {
            ...settings,
            displayMode,
            throwOnError: true,
          }),
        );
      } catch (error) {
        const cause = error as Error;
        file.message('Could not render math with KaTeX', {
          ancestors: [...parents, element],
          cause,
          place: element.position,
          ruleId: cause.name.toLowerCase(),
          source: 'rehype-katex',
        });

        try {
          result = parseKaTeXHtml(
            katex.renderToString(value, {
              ...settings,
              displayMode,
              strict: 'ignore',
              throwOnError: false,
            }),
          );
        } catch {
          result = [
            {
              type: 'element',
              tagName: 'span',
              properties: {
                className: ['katex-error'],
                style: `color:${settings.errorColor ?? '#cc0000'}`,
                title: String(error),
              },
              children: [{ type: 'text', value }],
            },
          ];
        }
      }

      const index = parent.children.indexOf(scope);
      parent.children.splice(index, 1, ...result);
      return SKIP;
    });
  };
}
