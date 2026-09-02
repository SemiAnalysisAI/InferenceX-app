// @vitest-environment jsdom

import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import { ScenarioSelector } from './chart-selectors';
import { TooltipProvider } from './tooltip';
import { Sequence } from '@/lib/data-mappings';

const route = vi.hoisted(() => ({ pathname: '/inference' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

it.each([
  ['/inference', Sequence.AgenticTraces, 'Agentic'],
  ['/zh/inference', Sequence.AgenticTraces, '智能体'],
  ['/inference', Sequence.EightK_OneK, '8K / 1K'],
  ['/zh/inference', Sequence.EightK_OneK, '8K / 1K'],
])('renders the sole scenario label before hydration on %s (%s)', (pathname, value, label) => {
  route.pathname = pathname;
  const container = document.createElement('div');
  container.innerHTML = renderToString(
    <TooltipProvider>
      <ScenarioSelector value={value} availableSequences={[value]} onChange={() => {}} />
    </TooltipProvider>,
  );

  const trigger = container.querySelector<HTMLButtonElement>('button[role="combobox"]');
  expect(trigger?.disabled).toBe(true);
  expect(trigger?.textContent).toBe(label);
});
