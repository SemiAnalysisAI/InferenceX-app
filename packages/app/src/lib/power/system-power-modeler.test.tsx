// @test-environment jsdom
import { describe, expect, it } from 'bun:test';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { modelSystemPower } from './modeled-system-power';
import { loadSystemPowerModeler, useSystemPowerModeler } from './system-power-modeler';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const modeler = useSystemPowerModeler();
  return createElement('span', null, modeler === modelSystemPower ? 'loaded' : 'loading');
}

describe('system power modeler', () => {
  it('loads the power model once', async () => {
    const first = loadSystemPowerModeler();
    expect(loadSystemPowerModeler()).toBe(first);
    expect(await first).toBe(modelSystemPower);
  });

  it('renders without the model on the server, so the chart stays loading there', () => {
    expect(renderToString(createElement(Probe))).toBe('<span>loading</span>');
  });

  it('hands the loaded model to the browser render', async () => {
    await loadSystemPowerModeler();
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(createElement(Probe)));
    expect(container.textContent).toBe('loaded');
    act(() => root.unmount());
  });
});
