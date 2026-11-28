// @test-environment jsdom

import { renderToString } from 'react-dom/server';
import { expect, it, mock } from 'bun:test';

import { ModelSelector, ScenarioSelector } from './chart-selectors';
import { TooltipProvider } from './tooltip';
import { Model, Scenario } from '@/lib/catalog/data-mappings';

const route = { pathname: '/infx/inference' };
mock.module('next/navigation', () => ({ usePathname: () => route.pathname }));

it.each(['/infx/inference', '/zh/infx/inference'])(
  'keeps the catalog label for a retained model absent from availability on %s',
  (pathname) => {
    route.pathname = pathname;
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <TooltipProvider>
        <ModelSelector
          value={Model.Muse_Spark_Open}
          availableModels={[Model.Kimi_K3]}
          onChange={() => {}}
          open
          data-testid="model-selector"
        />
      </TooltipProvider>,
    );
    expect(container.querySelector('[data-testid="model-selector"]')?.textContent).toContain(
      'Muse Spark 1.3/Open 816B',
    );
    expect(container.querySelector('[data-testid="model-selector"] img')?.getAttribute('src')).toBe(
      '/logos/meta-color.svg',
    );
    const options = [...container.querySelectorAll('[role="option"]')];
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain('Kimi K3');
  },
);

it.each([
  ['/infx/inference', 'Unregistered models'],
  ['/zh/infx/inference', '未注册模型'],
])('lists an overlay-only model in its own unregistered section on %s', (pathname, header) => {
  route.pathname = pathname;
  const container = document.createElement('div');
  container.innerHTML = renderToString(
    <TooltipProvider>
      <ModelSelector
        value="futuremodel9"
        availableModels={[Model.Kimi_K3, 'futuremodel9']}
        onChange={() => {}}
        open
        data-testid="model-selector"
      />
    </TooltipProvider>,
  );
  expect(container.querySelector('[data-testid="model-selector"]')?.textContent).toContain(
    'futuremodel9',
  );
  expect(container.textContent).toContain(header);
  const options = [...container.querySelectorAll('[role="option"]')].map((o) => o.textContent);
  expect(options).toHaveLength(2);
  expect(options[1]).toContain('futuremodel9');
});

it.each([
  ['/infx/inference', Scenario.AgenticTraces],
  ['/zh/infx/inference', Scenario.AgenticTraces],
  ['/infx/inference', Scenario.EightK_OneK],
  ['/zh/infx/inference', Scenario.EightK_OneK],
])('omits the sole scenario before hydration on %s (%s)', (pathname, value) => {
  route.pathname = pathname;
  const container = document.createElement('div');
  container.innerHTML = renderToString(
    <TooltipProvider>
      <ScenarioSelector value={value} availableScenarios={[value]} onChange={() => {}} />
    </TooltipProvider>,
  );

  expect(container.innerHTML).toBe('');
});
