import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

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

    for (const cls of ['katex-base', 'katex-strut']) {
      expect([...emitted], `expected the renderer to emit .${cls}`).toContain(cls);
      expect(css, `renderer emits .${cls} but the CSS never styles it`).toContain(`.${cls}`);
    }
  });
});
