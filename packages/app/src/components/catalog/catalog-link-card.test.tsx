// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

import { CatalogLinkCard } from './catalog-link-card';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CatalogLinkCard', () => {
  it('keeps catalog links focusable and exposes the scan hierarchy', () => {
    act(() => {
      root.render(
        <CatalogLinkCard
          href="/run/kimi-h100"
          title="Kimi on H100"
          eyebrow="Measured run"
          description="Measured throughput, latency & cost"
          slug="kimi-h100"
          locale="en"
          event="run_index_entry_clicked"
        />,
      );
    });

    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/run/kimi-h100');
    link?.focus();
    expect(document.activeElement).toBe(link);
    expect(link?.textContent).toContain('Measured run');
    expect(link?.textContent).toContain('Measured throughput, latency & cost');
  });

  it('renders localized titles without changing the destination contract', () => {
    act(() => {
      root.render(
        <CatalogLinkCard
          href="/zh/rankings/fastest-gpu-for-kimi"
          title="Kimi 最快 GPU 排行"
          description="按实测单 GPU tokens/s 排名"
          slug="fastest-gpu-for-kimi"
          locale="zh"
          event="ranking_index_entry_clicked"
        />,
      );
    });

    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      '/zh/rankings/fastest-gpu-for-kimi',
    );
    expect(container.textContent).toContain('Kimi 最快 GPU 排行');
  });
});
