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
  ['/inference', Sequence.OneK_OneK, '1K / 1K (deprecated)'],
  ['/zh/inference', Sequence.OneK_OneK, '1K / 1K（已弃用）'],
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

it.each([
  ['/inference', 'Scenario: Agentic'],
  ['/zh/inference', '场景: 智能体'],
])('renders an accessible inline title without a field label on %s', (pathname, name) => {
  route.pathname = pathname;
  const container = document.createElement('div');
  container.innerHTML = renderToString(
    <TooltipProvider>
      <h2>
        DeepSeek{' '}
        <ScenarioSelector
          variant="title"
          value={Sequence.AgenticTraces}
          availableSequences={[Sequence.AgenticTraces, Sequence.EightK_OneK]}
          onChange={() => {}}
        />
      </h2>
    </TooltipProvider>,
  );
  expect(container.querySelector('h2 label')).toBeNull();
  expect(container.querySelector('h2 div')).toBeNull();
  const trigger = container.querySelector<HTMLButtonElement>('h2 button[role="combobox"]');
  expect(trigger?.getAttribute('aria-label')).toBe(name);
  expect(trigger?.disabled).toBe(false);
});

it.each([
  ['/inference', Sequence.AgenticTraces, 'Agentic', 'Help: Agentic'],
  ['/zh/inference', Sequence.AgenticTraces, '智能体', '智能体说明'],
  ['/inference', Sequence.EightK_OneK, '8K / 1K', 'Help: 8K / 1K'],
  ['/zh/inference', Sequence.OneK_OneK, '1K / 1K（已弃用）', '1K / 1K（已弃用）说明'],
])('renders a sole title scenario as text with help on %s (%s)', (pathname, value, label, help) => {
  route.pathname = pathname;
  const container = document.createElement('div');
  container.innerHTML = renderToString(
    <TooltipProvider>
      <h2>
        <ScenarioSelector
          variant="title"
          value={value}
          availableSequences={[value]}
          onChange={() => {}}
          data-testid="scenario"
        />
      </h2>
    </TooltipProvider>,
  );
  expect(container.querySelector('[role="combobox"]')).toBeNull();
  expect(container.querySelector('h2 div')).toBeNull();
  expect(container.querySelector('[data-testid="scenario"]')?.tagName).toBe('SPAN');
  expect(container.querySelector('[data-testid="scenario"]')?.textContent).toBe(label);
  expect(container.querySelector('button')?.getAttribute('aria-label')).toBe(help);
});

it('keeps the title selector available to recover a stale scenario selection', () => {
  route.pathname = '/inference';
  const container = document.createElement('div');
  container.innerHTML = renderToString(
    <ScenarioSelector
      variant="title"
      value={Sequence.EightK_OneK}
      availableSequences={[Sequence.AgenticTraces]}
      onChange={() => {}}
    />,
  );
  expect(container.querySelector<HTMLButtonElement>('[role="combobox"]')?.disabled).toBe(false);
});
