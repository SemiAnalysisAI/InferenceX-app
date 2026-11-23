// @test-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'bun:test';

import { Model } from '@/lib/catalog/data-mappings';

import { InferenceEarlyFetch } from './inference-early-fetch';

describe('InferenceEarlyFetch', () => {
  it('puts the preloads and the script in the server HTML', () => {
    const html = renderToString(<InferenceEarlyFetch routeModel={Model.DeepSeek_R1} />);
    expect(html).toContain(
      '<link rel="preload" as="fetch" crossorigin="anonymous" href="/api/v1/availability/compact"/>',
    );
    expect(html).toContain(
      '<link rel="preload" as="fetch" crossorigin="anonymous" href="/api/v1/benchmarks?model=DeepSeek-R1-0528"/>',
    );
    expect(html).toContain('<script id="inference-early-fetch">');
  });

  it('renders nothing on a client navigation', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<InferenceEarlyFetch routeModel={Model.DeepSeek_R1} />));
    expect(
      document.querySelectorAll('link[rel="preload"], script#inference-early-fetch'),
    ).toHaveLength(0);
    act(() => root.unmount());
    container.remove();
  });
});
