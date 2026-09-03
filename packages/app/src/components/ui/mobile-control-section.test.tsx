// @vitest-environment jsdom

import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { MobileControlSection } from './mobile-control-section';

const renderSection = (count: number) => (
  <MobileControlSection label="More controls" count={count} countLabel="changed">
    <button>Metric</button>
  </MobileControlSection>
);

it('hydrates safely when URL settings differ from server defaults', async () => {
  const container = document.createElement('div');
  container.innerHTML = renderToString(renderSection(0));
  document.body.append(container);
  const onRecoverableError = vi.fn();
  let root: ReturnType<typeof hydrateRoot>;
  await act(() => {
    root = hydrateRoot(container, renderSection(2), { onRecoverableError });
  });
  expect(onRecoverableError).not.toHaveBeenCalled();
  expect(container.textContent).toContain('2 changed');
  expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
  act(() => root.unmount());
  container.remove();
});
