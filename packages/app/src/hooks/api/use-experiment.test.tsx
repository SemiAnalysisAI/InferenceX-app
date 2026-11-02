// @vitest-environment jsdom
import { act, createElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { CLIENT_SEARCH_CHANGE_EVENT } from '@/lib/routing/client-navigation';
import { useExperimentSelected } from './use-experiment';

function Selection() {
  return createElement('output', null, String(useExperimentSelected()));
}

afterEach(() => window.history.replaceState({}, '', '/'));

describe('experiment URL subscription', () => {
  it('prerenders without Next navigation context and hydrates the actual selector', async () => {
    window.history.replaceState({}, '', '/inference?experiment=weka-amg-kimi-k3');
    const serverHtml = renderToString(createElement(Selection));
    expect(serverHtml).toBe('<output>false</output>');
    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    const errors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot>;
    await act(() => {
      root = hydrateRoot(container, createElement(Selection), {
        onRecoverableError: (error) => errors.push(error),
      });
    });
    expect(container.textContent).toBe('true');
    expect(errors).toEqual([]);
    act(() => {
      window.history.replaceState({}, '', '/inference?experiment=other');
      window.dispatchEvent(new CustomEvent(CLIENT_SEARCH_CHANGE_EVENT));
    });
    expect(container.textContent).toBe('false');
    act(() => {
      window.history.replaceState({}, '', '/inference?experiment=weka-amg-kimi-k3');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(container.textContent).toBe('true');
    act(() => root!.unmount());
  });
});
