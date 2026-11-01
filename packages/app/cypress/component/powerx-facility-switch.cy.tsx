import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import type { InferenceData } from '@/components/inference/types';
import { PowerXFacilitySwitch } from '@/components/inference/powerx/PowerXLayout';
import PowerAnalysisPanels from '@/components/inference/ui/PowerAnalysisPanels';
import { PowerXSurfaceProvider } from '@/components/inference/ui/powerx-surface';
import type { BenchmarkRow } from '@/lib/api/api';
import { modelSystemPower } from '@/lib/power/modeled-system-power';

import { mountWithProviders } from '../support/test-utils';

const metric = (y: number) => ({ y, roof: false });
// One full chassis (8 GPUs) or one NVL72 compute tray (4 GPUs).
const row = (hardware: string, gpuWatts: number, gpus = hardware === 'gb200' ? 4 : 8) =>
  ({
    model: 'qwen3.5',
    hardware,
    framework: 'sglang',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: gpus,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: gpus,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: gpus,
    num_decode_gpu: gpus,
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc: 1,
    offload_mode: 'off',
    image: 'lmsysorg/sglang:v0.5.19-cu130',
    date: '2026-09-23',
    run_url: 'https://example.invalid/runs/900000001',
    metrics: {
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: gpuWatts,
      avg_total_gpu_power_w: gpuWatts * gpus,
      median_intvty: 100,
    },
  }) as unknown as BenchmarkRow;

const point = (id: number, hardware: 'b200' | 'gb200', conc: number, x: number, watts: number) =>
  ({
    id,
    hwKey: `${hardware}_sglang`,
    hw: hardware.toUpperCase(),
    framework: 'sglang',
    precision: 'fp8',
    physicalChips: 8,
    tp: 8,
    decode_tp: 8,
    conc,
    date: '2026-09-23',
    run_url: 'https://example.invalid/runs/900000001',
    benchmark_type: 'single_turn',
    x,
    y: watts,
    mean_tpot_intvty: x,
    median_intvty: x,
    output_tput_per_gpu: 50,
    measuredAvgPower: metric(watts),
    measuredJPerOutputToken: metric(10),
    utilityModeledWatts: metric(1),
    model: 'dsv4pro',
    disagg: false,
    modeledSystemPower: modelSystemPower(row(hardware, watts)),
  }) as unknown as InferenceData;

// Air-cooled B200 (PUE 1.3) next to liquid-cooled GB200 NVL72 (PUE 1.1).
const points: InferenceData[] = [
  point(1, 'b200', 64, 20, 640),
  point(2, 'b200', 16, 45, 520),
  point(3, 'b200', 4, 80, 380),
  point(11, 'gb200', 64, 30, 700),
  point(12, 'gb200', 16, 50, 560),
  point(13, 'gb200', 4, 100, 420),
];
// The same reduction ChartDisplay runs over the visible rows.
const pues = points.flatMap((p) =>
  p.modeledSystemPower?.status === 'supported' ? [p.modeledSystemPower.pue] : [],
);

for (const [label, width] of [
  ['mobile', 393],
  ['desktop', 1280],
] as const) {
  describe(`PowerX Include facility switch (${label})`, () => {
    beforeEach(() => {
      cy.viewport(width, 900);
      cy.on('uncaught:exception', (error) => {
        if (error.message.includes('ResizeObserver loop')) return false;
      });
    });

    it('starts on, shows the facility layer and labels the PUE range of the chips', () => {
      mountWithProviders(
        <PathnameContext.Provider value="/powerx">
          <PowerXSurfaceProvider>
            <div style={{ width: '100%', maxWidth: 1120, padding: 12, boxSizing: 'border-box' }}>
              <div className="mb-3 flex flex-wrap items-start gap-x-6">
                <PowerXFacilitySwitch pues={pues} />
              </div>
              <PowerAnalysisPanels
                data={points}
                xField="mean_tpot_intvty"
                xLabel="Interactivity (output tok/s/user)"
                chartId="powerx-facility-test"
                placement="before"
              />
            </div>
          </PowerXSurfaceProvider>
        </PathnameContext.Provider>,
        { inference: {}, unofficial: {} },
      );
      cy.get('[data-testid="power-chip-compare-value"]').should('exist');
      cy.scrollTo('top', { ensureScrollable: false });
      cy.screenshot(`powerx-facility-${label}`, { capture: 'viewport' });
      cy.get('[data-testid="powerx-facility-switch"] [role="switch"]').should(
        'have.attr',
        'aria-checked',
        'true',
      );
      cy.get('[data-testid="powerx-facility-switch"] label').should(
        'have.text',
        'Include facility (PUE 1.1–1.3)',
      );
      cy.get('[data-testid="power-chip-compare-segment"][data-band="facility"]').should(
        'have.length.greaterThan',
        0,
      );
      cy.get('[data-testid="powerx-facility-switch"]').then(($el) => {
        expect($el[0].scrollWidth).to.be.at.most($el[0].clientWidth + 1);
      });
      cy.get('[data-testid="powerx-facility-switch"] [role="switch"]').click();
      cy.get('[data-testid="power-chip-compare-segment"][data-band="facility"]').should(
        'have.length',
        0,
      );
    });
  });
}
