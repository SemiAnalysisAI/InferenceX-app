import ScatterGraph from '@/components/inference/ui/ScatterGraph';
import { Precision } from '@/lib/data-mappings';

import {
  createMockChartDefinition,
  createMockHardwareConfig,
  createMockInferenceData,
} from '../support/mock-data';
import { mountWithProviders } from '../support/test-utils';

const hwConfig = createMockHardwareConfig();

const CHART_ID = 'test-scatter-label-overlap';

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Overlap depth of two boxes along each axis; negative means no overlap. */
function overlap(a: Box, b: Box): { x: number; y: number } {
  return {
    x: Math.min(a.right, b.right) - Math.max(a.left, b.left),
    y: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
  };
}

/**
 * Both axes must exceed this for a collision to count. The placement engine
 * models a text block with fixed ascent/descent constants, so a glyph's real
 * ink box can stick out by about a pixel without anything looking wrong.
 */
const TOLERANCE_PX = 1;

/** A curve dense enough that its run-name pill has point labels to land on. */
function curve(hwKey: string, ys: number[]) {
  return ys.map((y, i) =>
    createMockInferenceData({
      hwKey,
      x: 2 ** (i + 3),
      y,
      conc: 2 ** (i + 3),
      precision: Precision.FP4,
      // Widens the label in advanced mode (a disagg prefill/decode split),
      // which is the shape that overlapped in practice.
      disagg: true,
      dp_attention: true,
      prefill_tp: 8,
      prefill_ep: 8,
      prefill_dp_attention: true,
      prefill_num_workers: 2,
      decode_tp: 16,
      decode_ep: 16,
      decode_dp_attention: true,
      decode_num_workers: 1,
    }),
  );
}

function mountChart(useAdvancedLabels: boolean) {
  mountWithProviders(
    <div style={{ width: 900, height: 600 }}>
      <ScatterGraph
        chartId={CHART_ID}
        modelLabel="DeepSeek R1"
        data={[
          ...curve('h100', [240, 232, 210, 180, 150, 118]),
          ...curve('b200_trt', [330, 315, 288, 250, 205, 160]),
        ]}
        xLabel="Concurrency"
        yLabel="Throughput / Chip (tok/s)"
        chartDefinition={createMockChartDefinition({
          chartType: 'interactivity',
          y_tpPerGpu_roofline: 'upper_left',
        })}
      />
    </div>,
    {
      inference: {
        hardwareConfig: hwConfig,
        activeHwTypes: new Set(['h100', 'b200_trt']),
        hwTypesWithData: new Set(['h100', 'b200_trt']),
        selectedPrecisions: [Precision.FP4],
        showLineLabels: true,
        showPointLabels: true,
        useAdvancedLabels,
      },
      unofficial: {},
    },
  );
}

/** Asserts no visible point label is drawn through a visible pill. */
function expectNoPillOverlap() {
  cy.get(`#${CHART_ID} svg .ll-bg`).should('exist');

  cy.get(`#${CHART_ID} svg`).then(($svg) => {
    const svg = $svg[0];

    const pills = [...svg.querySelectorAll<SVGGElement>('.line-label, .parallelism-label')]
      .filter((group) => group.style.opacity !== '0')
      .map((group) => ({
        label: group.textContent ?? '',
        box: (group.querySelector('.ll-bg, .pl-bg') as SVGRectElement).getBoundingClientRect(),
      }));

    const points = [...svg.querySelectorAll<SVGTextElement>('.point-label')]
      .filter((text) => {
        const group = text.closest<SVGGElement>('.dot-group');
        return text.style.opacity !== '0' && group?.style.opacity !== '0';
      })
      .map((text) => ({ label: text.textContent ?? '', box: text.getBoundingClientRect() }));

    // Without these the assertion below would pass on an empty chart.
    expect(pills.length, 'visible run-name pills').to.be.greaterThan(0);
    expect(points.length, 'visible point labels').to.be.greaterThan(3);

    const collisions: string[] = [];
    for (const pill of pills) {
      for (const point of points) {
        const { x, y } = overlap(pill.box, point.box);
        if (x > TOLERANCE_PX && y > TOLERANCE_PX) {
          collisions.push(
            `"${point.label}" overlaps pill "${pill.label}" by ${x.toFixed(1)}x${y.toFixed(1)}px`,
          );
        }
      }
    }

    expect(collisions, collisions.join('; ')).to.have.length(0);
  });
}

describe('Scatter label overlap', () => {
  it('draws both label kinds (guards the overlap assertions below)', () => {
    mountChart(false);
    cy.get(`#${CHART_ID} svg .line-label`).should('have.length.greaterThan', 0);
    cy.get(`#${CHART_ID} svg .point-label`).should('have.length.greaterThan', 3);
  });

  it('keeps point labels clear of the run-name pills', () => {
    mountChart(false);
    expectNoPillOverlap();
  });

  it('keeps the wider parallelism labels clear of the run-name pills', () => {
    mountChart(true);
    expectNoPillOverlap();
  });
});
