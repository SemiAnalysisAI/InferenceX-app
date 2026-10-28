// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildLadder, type LadderHardware } from '@/lib/powerx/ladder';

import { PowerLadder } from './power-ladder';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  // The SVG draws once its container has a measured width.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 720, 0),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function renderLadder(hardware: LadderHardware) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(<PowerLadder ladder={buildLadder(hardware, 700)!} color="#16a34a" locale="en" />),
  );
  return host;
}

describe('PowerLadder', () => {
  it('brackets the Bianca board on NVL72', () => {
    const view = renderLadder('gb200');
    expect(view.querySelector('[data-board="bianca"]')).not.toBeNull();
    expect(view.textContent).toMatch(/Bianca board \d[\d,]* W/u);
  });

  it('draws no board bracket on an HGX chassis', () => {
    const view = renderLadder('b200');
    expect(view.querySelector('[data-board]')).toBeNull();
    expect(view.textContent).not.toContain('Bianca');
  });
});
