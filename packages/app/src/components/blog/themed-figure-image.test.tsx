// @test-environment jsdom
import React, { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const themeState = { resolvedTheme: undefined as string | undefined };

mock.module('next-themes', () => ({
  useTheme: () => themeState,
}));

import { createMdxComponents } from '@/components/blog/mdx-components';
import { ThemedFigureImage } from '@/components/blog/themed-figure-image';
import figureDimensions from '@/lib/blog/figure-dimensions.json';

// A blog page builds its MDX components per render, once on the server and once when it
// hydrates, so the first-figure counter starts fresh each time as it does in production.
function PlainFigurePage() {
  const { Figure } = createMdxComponents();
  return <Figure src="/plain.png" alt="Plain diagram" />;
}

let container: HTMLDivElement;
let root: Root | undefined;

/**
 * The first render hydrates server markup, as the blog page does, so React adopts the prepaint
 * <script> instead of creating one on the client. Later renders update the hydrated tree.
 */
function renderUi(ui: React.ReactNode) {
  if (root) {
    const current = root;
    act(() => current.render(ui));
    return;
  }
  container.innerHTML = renderToString(ui);
  act(() => {
    root = hydrateRoot(container, ui);
  });
}

function runPrepaintScript(target = container) {
  const script = target.querySelector('script');
  expect(script).not.toBeNull();
  Object.defineProperty(document, 'currentScript', {
    configurable: true,
    value: script,
  });
  try {
    // oxlint-disable-next-line no-new-func, unicorn/new-for-builtins -- execute the emitted parser-time bootstrap verbatim.
    Function(script?.textContent ?? '')();
  } finally {
    Reflect.deleteProperty(document, 'currentScript');
  }
}

beforeEach(() => {
  themeState.resolvedTheme = undefined;
  document.documentElement.className = '';
  container = document.createElement('div');
  document.body.append(container);
  root = undefined;
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container.remove();
  document.documentElement.className = '';
});

describe('ThemedFigureImage', () => {
  it.each([
    ['light', '/chart-light.png'],
    ['dark', '/chart-dark.png'],
  ])('gives an eager cold %s render exactly one active source', (theme, expectedSrc) => {
    document.documentElement.className = theme;
    renderUi(
      <ThemedFigureImage
        srcLight="/chart-light.png"
        srcDark="/chart-dark.png"
        alt="Throughput chart"
        loading="eager"
        className="chart"
      />,
    );

    const image = container.querySelector(':scope > img');
    expect(image?.getAttribute('src')).toBe(expectedSrc);
    expect(container.querySelectorAll(':scope > img[src]')).toHaveLength(1);
    expect(image?.getAttribute('loading')).toBe('eager');
    expect(image?.getAttribute('alt')).toBe('Throughput chart');
  });

  it('selects one request-bearing source in server markup before paint', () => {
    document.documentElement.className = 'light';
    const serverContainer = document.createElement('div');
    serverContainer.innerHTML = renderToStaticMarkup(
      <ThemedFigureImage
        srcLight="/chart-light.png"
        srcDark="/chart-dark.png"
        alt="Throughput chart"
        loading="eager"
        className="chart"
      />,
    );
    const image = serverContainer.querySelector(':scope > img');
    expect(image?.hasAttribute('src')).toBe(false);

    runPrepaintScript(serverContainer);

    expect(image?.getAttribute('src')).toBe('/chart-light.png');
  });

  it('applies the matching responsive candidates before the source in server markup', () => {
    document.documentElement.className = 'dark';
    const serverContainer = document.createElement('div');
    serverContainer.innerHTML = renderToStaticMarkup(
      <ThemedFigureImage
        srcLight="/light-1200.png"
        srcDark="/dark-1200.png"
        srcSetLight="/light-640.png 640w, /light-1200.png 1200w"
        srcSetDark="/dark-640.png 640w, /dark-1200.png 1200w"
        sizes="100vw"
        width={1200}
        height={600}
        alt="Throughput chart"
        loading="eager"
        className="chart"
      />,
    );
    const image = serverContainer.querySelector(':scope > img');
    expect(image?.hasAttribute('srcset')).toBe(false);
    expect(image?.getAttribute('width')).toBe('1200');
    expect(image?.getAttribute('height')).toBe('600');

    runPrepaintScript(serverContainer);

    expect(image?.getAttribute('srcset')).toBe('/dark-640.png 640w, /dark-1200.png 1200w');
    expect(image?.getAttribute('src')).toBe('/dark-1200.png');
  });

  it('updates the same image when the application theme changes', () => {
    themeState.resolvedTheme = 'light';
    renderUi(
      <ThemedFigureImage
        srcLight="/chart-light.png"
        srcDark="/chart-dark.png"
        alt="Throughput chart"
        loading="lazy"
        className="chart"
      />,
    );
    const image = container.querySelector(':scope > img');
    expect(image?.getAttribute('src')).toBe('/chart-light.png');

    themeState.resolvedTheme = 'dark';
    renderUi(
      <ThemedFigureImage
        srcLight="/chart-light.png"
        srcDark="/chart-dark.png"
        alt="Throughput chart"
        loading="lazy"
        className="chart"
      />,
    );

    expect(container.querySelectorAll(':scope > img')).toHaveLength(1);
    expect(container.querySelector(':scope > img')).toBe(image);
    expect(image?.getAttribute('src')).toBe('/chart-dark.png');
  });

  it('falls back to a plain image for an MDX figure with no recorded size', () => {
    renderUi(<PlainFigurePage />);

    const image = container.querySelector('img');
    expect(container.querySelector('script')).toBeNull();
    expect(image?.getAttribute('src')).toBe('/plain.png');
    expect(image?.dataset.srcLight).toBeUndefined();
    expect(image?.getAttribute('loading')).toBe('eager');
    expect(image?.getAttribute('alt')).toBe('Plain diagram');
  });

  it('serves sized MDX figures through the image optimizer, eager only for the first', () => {
    const [src, [width, height]] = Object.entries(figureDimensions)[0];
    function Page() {
      const { Figure } = createMdxComponents();
      return (
        <>
          <Figure src={src} alt="First" />
          <Figure src={src} alt="Second" />
        </>
      );
    }
    renderUi(<Page />);

    const [first, second] = container.querySelectorAll('img');
    for (const image of [first, second]) {
      expect(image.getAttribute('width')).toBe(String(width));
      expect(image.getAttribute('height')).toBe(String(height));
      expect(image.getAttribute('src')).toContain('/_next/image?url=');
      expect(image.getAttribute('srcset')).toContain(encodeURIComponent(src));
      expect(image.getAttribute('sizes')).toBeTruthy();
    }
    expect(first.getAttribute('loading')).toBe('eager');
    expect(first.getAttribute('fetchpriority')).toBe('high');
    expect(second.getAttribute('loading')).toBe('lazy');
    expect(second.hasAttribute('fetchpriority')).toBe(false);
  });

  it('pairs the noscript fallback source with its own candidates', () => {
    const markup = renderToStaticMarkup(
      <ThemedFigureImage
        srcLight="/light-1200.png"
        srcDark="/dark.png"
        srcSetLight="/light-640.png 640w, /light-1200.png 1200w"
        alt="Throughput chart"
        loading="lazy"
        className="chart"
      />,
    );
    const noscript = markup.slice(markup.indexOf('<noscript>'));
    expect(noscript).toContain('src="/dark.png"');
    expect(noscript).not.toContain('srcSet');
    expect(noscript).not.toContain('srcset');
  });
});
