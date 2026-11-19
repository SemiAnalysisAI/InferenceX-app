import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import figureDimensions from './figure-dimensions.json';
import { figureSources } from './figure-sources';

const CONTENT_DIR = path.resolve(import.meta.dirname, '../../../content');

describe('figureSources', () => {
  it('collects src, srcLight and srcDark from every Figure in document order', () => {
    const mdx = `
Intro with a [link](https://example.com) and <b>markup</b>.

<Figure
  src="/images/post/a.png"
  alt="A"
  caption="Source: [paper](https://arxiv.org/abs/1)"
/>

<Figure srcLight="/images/post/b-light.png" srcDark="/images/post/b-dark.png" alt="B" />

<img src="/images/not-a-figure.png" />
`;
    expect(figureSources(mdx)).toEqual([
      '/images/post/a.png',
      '/images/post/b-light.png',
      '/images/post/b-dark.png',
    ]);
  });
});

describe('figure-dimensions.json', () => {
  const sizes: Record<string, number[] | undefined> = figureDimensions;

  it('sizes every figure the MDX content renders (run `bun run blog:figure-dimensions`)', () => {
    const missing = readdirSync(CONTENT_DIR, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.mdx'))
      .flatMap((file) => figureSources(readFileSync(path.join(CONTENT_DIR, file), 'utf8')))
      .filter((src) => !sizes[src]);
    expect([...new Set(missing)]).toEqual([]);
  });

  it('stores positive integer pixel sizes', () => {
    for (const [src, size] of Object.entries(sizes)) {
      expect(size, src).toHaveLength(2);
      for (const value of size ?? []) expect(Number.isInteger(value) && value > 0, src).toBe(true);
    }
  });
});
