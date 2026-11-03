import { lazy } from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import { describe, expect, it } from 'vitest';

import { hydrationIsland } from './hydration-island';

const PARAGRAPHS = Array.from({ length: 400 }, (_, index) => `paragraph ${index} `.repeat(4));

function LargeContent({ label }: { label: string }) {
  return (
    <section data-label={label}>
      {PARAGRAPHS.map((text) => (
        <p key={text}>{text}</p>
      ))}
    </section>
  );
}

async function prerenderHtml(node: React.ReactNode) {
  const { prelude } = await prerenderToNodeStream(node);
  let html = '';
  for await (const chunk of prelude) html += String(chunk);
  return html;
}

describe('hydrationIsland', () => {
  it('server-renders a lazily loaded component in document order inside an Activity boundary', async () => {
    const Island = hydrationIsland(
      lazy(async () => {
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, 5);
        await promise;
        return { default: LargeContent };
      }),
    );

    const html = await prerenderHtml(
      <main>
        <h1>before</h1>
        <Island label="island" />
        <footer>after</footer>
      </main>,
    );

    expect(html.length).toBeGreaterThan(13_000);
    expect(html).toContain('<!--&--><section data-label="island">');
    expect(html).not.toContain('hidden id="S:');
    expect(html).not.toContain('<!--$');
    const order = ['<h1>before</h1>', 'paragraph 399', '<footer>after</footer>'].map((marker) =>
      html.indexOf(marker),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order[0]).toBeGreaterThanOrEqual(0);
  });
});
