// @vitest-environment jsdom

import { act, useEffect, useState } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Model, Sequence } from '@/lib/catalog/data-mappings';

import type { CalculatorUrlSeed } from './url-seed';
import { CalculatorUrlSeedBoundary } from './url-seed-boundary';

const navigation = vi.hoisted(() => ({ prerendering: false }));

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => {
    if (navigation.prerendering) {
      throw Object.assign(new Error('Bail out to client-side rendering: useSearchParams()'), {
        digest: 'BAILOUT_TO_CLIENT_SIDE_RENDERING',
      });
    }
    return new URLSearchParams(window.location.search);
  },
}));

let mounts = 0;

function Tool({ seed }: { seed: CalculatorUrlSeed }) {
  const [initial] = useState(seed);
  useEffect(() => {
    mounts += 1;
  }, []);
  return <input readOnly data-model={initial.model} data-sequence={initial.sequence ?? ''} />;
}

const page = () => (
  <CalculatorUrlSeedBoundary routeModel={Model.Kimi_K3}>
    {(seed) => <Tool seed={seed} />}
  </CalculatorUrlSeedBoundary>
);

function prerender(url: string): HTMLDivElement {
  window.history.replaceState(null, '', url.split('?')[0]);
  navigation.prerendering = true;
  const container = document.createElement('div');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    container.innerHTML = renderToString(page());
  } finally {
    navigation.prerendering = false;
    vi.mocked(console.error).mockRestore();
  }
  document.body.append(container);
  window.history.replaceState(null, '', url);
  return container;
}

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
  mounts = 0;
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
});

async function hydrate(container: HTMLDivElement) {
  const onRecoverableError = vi.fn();
  let root: Root | undefined;
  await act(() => {
    root = hydrateRoot(container, page(), { onRecoverableError });
  });
  cleanup = () => act(() => root?.unmount());
  return onRecoverableError;
}

describe('CalculatorUrlSeedBoundary', () => {
  it('hydrates the prerendered tool in place when the query does not change the seed', async () => {
    const container = prerender('/infx/calculator/kimi-k3?utm_source=newsletter');
    const prerendered = container.querySelector('input');
    expect(prerendered?.dataset.model).toBe(Model.Kimi_K3);

    const onRecoverableError = await hydrate(container);

    expect(container.querySelector('input')).toBe(prerendered);
    expect(mounts).toBe(1);
    expect(onRecoverableError).not.toHaveBeenCalled();
  });

  it('remounts the tool on the query seed after hydrating the path seed', async () => {
    const container = prerender('/infx/calculator/kimi-k3?g_model=DeepSeek-V4-Pro&i_seq=1k%2F1k');
    expect(container.querySelector('input')?.dataset.model).toBe(Model.Kimi_K3);

    const onRecoverableError = await hydrate(container);

    const input = container.querySelector('input');
    expect(input?.dataset.model).toBe(Model.DeepSeek_V4_Pro);
    expect(input?.dataset.sequence).toBe(Sequence.OneK_OneK);
    expect(onRecoverableError).not.toHaveBeenCalled();
  });

  it('mounts a client-rendered tool once, on the query seed, and keeps it through URL rewrites', async () => {
    window.history.replaceState(null, '', '/infx/calculator/kimi-k3?g_model=DeepSeek-V4-Pro');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    cleanup = () => act(() => root.unmount());
    await act(() => root.render(page()));
    expect(container.querySelector('input')?.dataset.model).toBe(Model.DeepSeek_V4_Pro);
    expect(mounts).toBe(1);

    window.history.replaceState(null, '', '/infx/calculator/kimi-k3?i_seq=1k%2F1k');
    await act(() => root.render(page()));

    expect(container.querySelector('input')?.dataset.sequence).toBe('');
    expect(mounts).toBe(1);
  });
});
