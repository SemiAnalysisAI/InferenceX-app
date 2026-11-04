// @vitest-environment jsdom

import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import { ScenarioSelector } from './chart-selectors';
import { TooltipProvider } from './tooltip';
import { Sequence } from '@/lib/catalog/data-mappings';

const route = vi.hoisted(() => ({ pathname: '/inference' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

it.each([
  ['/inference', Sequence.AgenticTraces],
  ['/zh/inference', Sequence.AgenticTraces],
  ['/inference', Sequence.EightK_OneK],
  ['/zh/inference', Sequence.EightK_OneK],
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
