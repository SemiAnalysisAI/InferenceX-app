import { useState } from 'react';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import type { PowerCompare } from '@/components/inference/types';
import { MeasuredMetricControls } from '@/components/inference/ui/MeasuredMetricControls';

function Controls() {
  const [metric, setMetric] = useState('y_measuredAvgPower');
  return (
    <div className="p-4">
      <MeasuredMetricControls metric={metric} onChange={setMetric} />
      <output data-testid="selected-metric">{metric}</output>
    </div>
  );
}

describe('Power boundary labels', () => {
  for (const locale of ['en', 'zh'] as const) {
    it(`keeps boundary selection clear (${locale})`, () => {
      const width = locale === 'en' ? 1280 : 390;
      cy.viewport(width, 720);
      cy.mount(
        <PathnameContext.Provider value={locale === 'en' ? '/inference' : '/zh/inference'}>
          <Controls />
        </PathnameContext.Provider>,
      );
      const labels =
        locale === 'en'
          ? ['GPU Level Measured', 'All in Measured IT (no PUE)', 'All in Measured']
          : ['GPU 实测功耗', '整体实测 IT 功耗（不含 PUE）', '整体实测功耗'];
      cy.get('[data-testid="measured-power-basis"]').click();
      cy.get('[data-select-option]').should(($options) => {
        expect([...$options].map((option) => option.textContent?.trim())).to.deep.equal(labels);
      });
      cy.get('[data-select-option][data-value="utility-modeled"]').click();
      cy.get('[data-select-option]').should('not.exist');
      cy.get('[data-testid="selected-metric"]').should('have.text', 'y_utilityModeledWatts');
      cy.get('[data-testid="measured-metric-controls"]').should(($controls) => {
        const box = $controls[0].getBoundingClientRect();
        expect(box.left).to.be.at.least(0);
        expect(box.right).to.be.at.most(width);
        expect($controls[0].scrollWidth).to.be.at.most($controls[0].clientWidth);
      });
      cy.screenshot(`power-boundary-selected-${locale}`, { overwrite: true });
      cy.get('[data-testid="measured-power-basis"]').click();
      cy.get('[data-select-option][data-value="gpu-measured"]').click();
      cy.get('[data-testid="selected-metric"]').should('have.text', 'y_measuredAvgPower');
      cy.get('[data-testid="measured-power-basis"]').click();
      cy.get('[data-select-option]').should('be.visible');
      cy.screenshot(`power-boundary-options-${locale}`, { overwrite: true });
    });
  }
});

function Harness({
  initial,
  onChange,
  compare = 'none',
}: {
  initial: string;
  onChange: (metric: string) => void;
  compare?: PowerCompare;
}) {
  const [metric, setMetric] = useState(initial);
  const [mode, setMode] = useState<PowerCompare>(compare);
  return (
    <div className="p-4">
      <MeasuredMetricControls
        metric={metric}
        onChange={(next) => {
          onChange(next);
          setMetric(next);
        }}
        compare={mode}
        onCompareChange={setMode}
      />
      <output data-testid="selected-metric">{metric}</output>
      <output data-testid="selected-compare">{mode}</output>
    </div>
  );
}

function mountControls(initial = 'y_measuredAvgPower', locale: 'en' | 'zh' = 'en') {
  const onChange = cy.stub().as('change');
  cy.mount(
    <PathnameContext.Provider value={locale === 'zh' ? '/zh/powerx' : '/powerx'}>
      <Harness initial={initial} onChange={onChange} />
    </PathnameContext.Provider>,
  );
}

function selectSetting(control: string, value: string) {
  cy.get(`[data-testid="measured-${control}"]`).click();
  cy.get(`[role="option"][data-value="${value}"]`).click();
}

describe('PowerX advanced metric controls', () => {
  it('keeps P75 and P90 visible and selects their existing metric keys', () => {
    mountControls();
    cy.get('[data-testid="measured-power-statistic-p75"]').should('be.visible').click();
    cy.get('@change').should('have.been.calledWith', 'y_measuredP75Power');
    cy.get('[data-testid="measured-power-statistic-p75"]').should(
      'have.attr',
      'aria-pressed',
      'true',
    );
    cy.get('[data-testid="measured-power-statistic-p90"]').click();
    cy.get('@change').should('have.been.calledWith', 'y_measuredP90Power');
  });

  it('explains in the Boundary menu that All in Measured models unmeasured components', () => {
    mountControls();
    cy.get('[data-testid="measured-power-basis"]').click();
    cy.get('[data-testid="option-help-utility-modeled"]').click();
    cy.get('[data-testid="option-help-content-utility-modeled"]').should(
      'contain.text',
      'unmeasured components are modeled',
    );
  });

  it('resets a fleet percentile to role average and only enables TDP for the whole-fleet average', () => {
    mountControls('y_measuredP75Power');
    selectSetting('power-scope', 'prefill');
    cy.get('@change').should('have.been.calledWith', 'y_measuredPrefillAvgPower');
    cy.get('[data-testid="measured-power-statistic-p75"]').should('be.disabled');
    cy.get('[data-testid="measured-power-statistic-p90"]').should('be.disabled');
    selectSetting('power-scope', 'all');
    selectSetting('power-display', 'tdp');
    cy.get('@change').should('have.been.calledWith', 'y_measuredPowerPercentTdp');
    cy.get('[data-testid="measured-power-statistic-p75"]').click();
    cy.get('@change').should('have.been.calledWith', 'y_measuredP75Power');
    cy.get('[data-testid="measured-power-display"]').should('contain.text', 'W/chip');
  });

  it('keeps energy normalization separate from role attribution when changing denominator', () => {
    mountControls('y_measuredJPerInputToken');
    selectSetting('energy-scope', 'prefill');
    cy.get('@change').should('have.been.calledWith', 'y_measuredPrefillJPerInputToken');
    selectSetting('energy-denominator', 'output');
    cy.get('@change').should('have.been.calledWith', 'y_measuredJPerOutputToken');
    cy.get('[data-testid="measured-energy-scope"]').should('contain.text', 'All GPUs');
    selectSetting('energy-denominator', 'total');
    cy.get('@change').should('have.been.calledWith', 'y_measuredJPerTotalToken');
    cy.get('[data-testid="measured-energy-scope"]').should('be.disabled');
  });

  it('switches successful-query J and Wh and restores J for token normalization', () => {
    mountControls('y_measuredJPerOutputToken');
    selectSetting('energy-denominator', 'query');
    cy.get('@change').should('have.been.calledWith', 'y_measuredJPerSuccessfulQuery');
    selectSetting('energy-unit', 'wattHours');
    cy.get('@change').should('have.been.calledWith', 'y_measuredWhPerSuccessfulQuery');
    selectSetting('energy-denominator', 'input');
    cy.get('@change').should('have.been.calledWith', 'y_measuredJPerInputToken');
    cy.get('[data-testid="measured-energy-unit"]').should('not.exist');
  });

  for (const metric of ['y_measuredPrefillAvgPower', 'y_measuredDecodeAvgPower']) {
    it(`hydrates ${metric} with only role-average statistics enabled`, () => {
      mountControls(metric);
      cy.get('[data-testid="measured-power-scope"]').should(
        'contain.text',
        metric.includes('Prefill') ? 'Prefill' : 'Decode',
      );
      cy.get('[data-testid="measured-power-statistic-p75"]').should('be.disabled');
      cy.get('@change').should('not.have.been.called');
    });
  }

  it('offers both the two-boundary and the all-four-boundary compare', () => {
    mountControls('y_measuredJPerOutputToken');
    cy.get('[data-testid="measured-power-compare"]').click();
    cy.get('[role="option"][data-value="all"]').should('contain.text', 'All five').click();
    cy.get('[data-testid="selected-compare"]').should('have.text', 'all');
    cy.get('[data-testid="measured-power-compare"]').click();
    cy.get('[role="option"][data-value="boundaries"]').click();
    cy.get('[data-testid="selected-compare"]').should('have.text', 'boundaries');
  });

  it('keeps Chinese P75 controls within a phone screen', () => {
    cy.viewport(390, 844);
    mountControls('y_measuredP75Power', 'zh');
    cy.get('[data-testid="measured-metric-controls"]').within(() => {
      cy.get('button').each(($button) => {
        const bounds = $button[0].getBoundingClientRect();
        expect(bounds.left).to.be.at.least(0);
        expect(bounds.right).to.be.at.most(390);
      });
      cy.contains('button', 'P90').should('be.visible').click();
    });
    cy.get('@change').should('have.been.calledWith', 'y_measuredP90Power');
  });
});
