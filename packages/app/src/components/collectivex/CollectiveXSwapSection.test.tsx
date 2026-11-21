// @test-environment jsdom
import { buildDatasetFromNeutral } from '@semianalysisai/inferencex-db/collectivex/reader';
import {
  makeSwapDoc,
  swapMatrix,
  swapMeta,
} from '@semianalysisai/inferencex-db/collectivex/swap-test-fixture';
import { expect, it } from 'bun:test';

import {
  $,
  $$,
  click,
  contains,
  eventually,
  fakeLayout,
  get,
  isVisible,
  render,
  setChecked,
} from '@/test/dom';

import { CollectiveXSwapSection } from './CollectiveXSwapSection';

const points = () => $$('[data-testid="collectivex-swap-chart"] .point');
const legendBoxes = () =>
  $$<HTMLInputElement>('[data-testid="chart-legend"] input[type="checkbox"]');

it('keeps comparison runs independently toggleable and distinguishes their lines', async () => {
  const datasets = ['170', '171'].map((run_id) =>
    buildDatasetFromNeutral(swapMatrix, [makeSwapDoc()], { ...swapMeta, run_id }),
  );
  fakeLayout(1280);
  render(
    <CollectiveXSwapSection
      datasets={datasets}
      runIndexById={
        new Map([
          ['170', 0],
          ['171', 1],
        ])
      }
    />,
  );
  await eventually(() => expect(points()).toHaveLength(4));
  const lines = $$('[data-testid="collectivex-swap-chart"] .line-path');
  expect(lines).toHaveLength(2);
  expect(lines[0].getAttribute('stroke-dasharray')).not.toBe(
    lines[1].getAttribute('stroke-dasharray'),
  );
  expect(get('[data-testid="swap-roofline-legend"]').textContent).toContain('64 GB/s');
  const rooflines = $$('.roofline-path');
  expect(rooflines).toHaveLength(1);
  expect(rooflines[0].getAttribute('d')).toMatch(/^M[\d.]+,(?<y>[\d.]+)L[\d.]+,\k<y>$/);
  click(contains('[data-testid="swap-metric"] *', 'Latency'));
  await eventually(() => expect($('[data-testid="swap-roofline-legend"]')).toBeNull());
  click(contains('[data-testid="swap-metric"] *', 'Bandwidth'));
  setChecked(legendBoxes()[1], false);
  await eventually(() => expect(points()).toHaveLength(2));
  setChecked(legendBoxes()[0], false);
  await eventually(() => expect(points()).toHaveLength(0));
  expect($('[data-testid="swap-roofline-legend"]')).toBeNull();
  expect(isVisible(contains('No measured swap-block points match this selection'))).toBe(true);
  setChecked(legendBoxes()[1], true);
  await eventually(() => expect(points()).toHaveLength(2));
});
