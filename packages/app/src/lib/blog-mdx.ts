import { compileMDX } from 'next-mdx-remote/rsc';
import rehypeShikiFromHighlighter from '@shikijs/rehype/core';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import type { HighlighterCore } from 'shiki/types';

import { createMdxComponents } from '@/components/blog/mdx-components';
import type { BlogLocale } from '@/lib/blog';
import { rehypeKatex } from '@/lib/rehype-katex';

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import('shiki/themes/github-dark.mjs'), import('shiki/themes/github-light.mjs')],
      langs: [
        import('shiki/langs/typescript.mjs'),
        import('shiki/langs/javascript.mjs'),
        import('shiki/langs/python.mjs'),
        import('shiki/langs/bash.mjs'),
        import('shiki/langs/json.mjs'),
        import('shiki/langs/yaml.mjs'),
        import('shiki/langs/css.mjs'),
        import('shiki/langs/html.mjs'),
        import('shiki/langs/tsx.mjs'),
        import('shiki/langs/jsx.mjs'),
        import('shiki/langs/sql.mjs'),
        import('shiki/langs/go.mjs'),
        import('shiki/langs/rust.mjs'),
      ],
      engine: createOnigurumaEngine(import('shiki/wasm')),
    });
  }
  return highlighterPromise;
}

export async function compileBlogMdx(source: string, locale: BlogLocale = 'en') {
  const highlighter = await getHighlighter();

  return compileMDX({
    source,
    components: createMdxComponents(locale),
    options: {
      mdxOptions: {
        // Keep prices like $1.95/GPU/hr as prose; math must use `$$` delimiters.
        remarkPlugins: [remarkGfm, [remarkMath, { singleDollarTextMath: false }]],
        rehypePlugins: [
          // A malformed expression renders inline in red instead of failing the whole build.
          [rehypeKatex, { strict: false }],
          [
            rehypeShikiFromHighlighter,
            highlighter,
            {
              themes: { dark: 'github-dark', light: 'github-light' },
              defaultColor: false,
            },
          ],
        ],
      },
    },
  });
}
