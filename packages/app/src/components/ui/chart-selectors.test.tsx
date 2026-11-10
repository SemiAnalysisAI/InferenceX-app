// @vitest-environment jsdom

import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import { ModelSelector, ScenarioSelector } from './chart-selectors';
import { TooltipProvider } from './tooltip';
import { Model, Sequence } from '@/lib/catalog/data-mappings';

const route = vi.hoisted(() => ({ pathname: '/infx/inference' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

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
    const options = [...container.querySelectorAll('[role="option"]')];
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain('Kimi K3');
  },
);

it.each([
  ['/infx/inference', Sequence.AgenticTraces],
  ['/zh/infx/inference', Sequence.AgenticTraces],
  ['/infx/inference', Sequence.EightK_OneK],
  ['/zh/infx/inference', Sequence.EightK_OneK],
])('omits the sole scenario before hydration on %s (%s)', (pathname, value) => {
  route.pathname = pathname;
  const container = document.createElement('div');
  container.innerHTML = renderToString(
    <TooltipProvider>
      <ScenarioSelector value={value} availableSequences={[value]} onChange={() => {}} />
    </TooltipProvider>,
  );

  expect(container.innerHTML).toBe('');
});
