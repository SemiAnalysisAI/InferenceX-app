// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const themeState = vi.hoisted(() => ({ resolvedTheme: undefined as string | undefined }));

vi.mock('next-themes', () => ({
  useTheme: () => themeState,
}));

import { createMdxComponents } from '@/components/blog/mdx-components';
import { ThemedFigureImage } from '@/components/blog/themed-figure-image';

let container: HTMLDivElement;
let root: Root;

function renderUi(ui: React.ReactNode) {
  act(() => root.render(ui));
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
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.documentElement.className = '';
});

describe('ThemedFigureImage', () => {
  it.each([
    ['light', '/chart-light.png'],
    ['dark', '/chart-dark.png'],
    ['minecraft', '/chart-dark.png'],
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

  it('leaves an unthemed MDX figure on the existing plain image path', () => {
    const Figure = createMdxComponents().Figure;
    renderUi(<Figure src="/plain.png" alt="Plain diagram" />);

    const image = container.querySelector('img');
    expect(container.querySelector('script')).toBeNull();
    expect(image?.getAttribute('src')).toBe('/plain.png');
    expect(image?.dataset.srcLight).toBeUndefined();
    expect(image?.getAttribute('loading')).toBe('eager');
    expect(image?.getAttribute('alt')).toBe('Plain diagram');
  });
});
