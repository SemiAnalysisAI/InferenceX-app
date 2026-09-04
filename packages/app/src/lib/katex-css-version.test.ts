import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Blog post pages import `katex/dist/katex.min.css`, and the local rehype
 * renderer imports the same top-level KaTeX package. Keep the generated layout
 * classes aligned with that stylesheet across future KaTeX majors.
 */

const appRequire = createRequire(import.meta.url);

describe('KaTeX CSS matches the KaTeX that renders the HTML', () => {
  it('styles the layout classes the renderer actually emits', async () => {
    const katexModule = await import('katex');
    const katex = katexModule.default;
    const html = katex.renderToString('x^2', { throwOnError: false });

    const cssPath = path.join(
      path.dirname(appRequire.resolve('katex/package.json')),
      'dist',
      'katex.min.css',
    );
    const css = fs.readFileSync(cssPath, 'utf8');

    const emitted = new Set(
      [...html.matchAll(/class="(?<names>[^"]+)"/gu)].flatMap((m) => m.groups!.names.split(/\s+/u)),
    );
    expect(emitted).toContain('katex');

    // These layout classes were prefixed in KaTeX 0.18. Assert both sides so
    // a future rename cannot make the stylesheet check pass vacuously.
    for (const cls of ['katex-base', 'katex-strut']) {
      expect([...emitted], `expected the renderer to emit .${cls}`).toContain(cls);
      expect(css, `renderer emits .${cls} but the CSS never styles it`).toContain(`.${cls}`);
    }
  });
});
