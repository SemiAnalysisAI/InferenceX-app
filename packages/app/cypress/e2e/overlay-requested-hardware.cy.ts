import {
  availabilityBody,
  interceptDerivedAgenticMetrics,
  unlockAgenticGate,
} from '../support/e2e';
import {
  AGENTIC_DATE,
  availability,
  b300Rows,
  countVisible,
  OVERLAY_RUN_BRANCH,
  OVERLAY_RUN_ID,
  OVERLAY_RUN_URL,
  REAL_CONFIGS,
} from '../support/overlay-fixtures';
import { visiblePoints } from '../support/scatter-points';

const CHART_DISPLAY = '[data-testid="inference-chart-display"]';
const OVERLAY_POINTS = `${CHART_DISPLAY} svg .unofficial-overlay-pt`;

function interceptOfficial(rows: readonly { hardware: string; framework: string }[]) {
  cy.intercept('GET', '/api/v1/availability/compact', {
    body: availabilityBody(
      rows.map((row) => ({
        ...availability[0]!,
        hardware: row.hardware,
        framework: row.framework,
      })),
    ),
  });
  cy.intercept('GET', '/api/v1/benchmarks*', { body: rows });
  interceptDerivedAgenticMetrics();
}

function interceptOverlay() {
  cy.intercept('GET', '/api/unofficial-run*', {
    body: {
      runInfos: [
        {
          id: OVERLAY_RUN_ID,
          name: OVERLAY_RUN_BRANCH,
          branch: OVERLAY_RUN_BRANCH,
          sha: 'abc000',
          createdAt: `${AGENTIC_DATE}T00:00:00Z`,
          url: OVERLAY_RUN_URL,
          conclusion: 'success',
          status: 'completed',
          isNonMainBranch: true,
        },
      ],
      benchmarks: b300Rows(OVERLAY_RUN_URL, 'h100'),
      evaluations: [],
    },
  }).as('unofficialRun');
}

function visit(path: string) {
  cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      unlockAgenticGate(win);
    },
  });
}

function expectOfficialHardware(shown: string[]) {
  cy.scatterPoints(CHART_DISPLAY).should((points) => {
    const hwKeys = new Set(visiblePoints(points).map((point) => String(point.datum.hwKey)));
    expect([...hwKeys].toSorted(), 'visible official hardware').to.deep.equal(shown);
  });
}

function expectFullOverlay() {
  cy.get(OVERLAY_POINTS).should(($pts) => {
    expect(countVisible($pts), 'visible overlay points').to.eq(REAL_CONFIGS.length);
  });
}

describe('Requested official hardware with an unofficial overlay', () => {
  beforeEach(() => {
    interceptOfficial([...b300Rows(null), ...b300Rows(null, 'b200')]);
    interceptOverlay();
  });

  it('shows every official SKU next to the overlay by default', () => {
    visit(`/infx/inference/deepseek-v4?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces`);
    cy.wait('@unofficialRun');
    expectOfficialHardware(['b200_sglang', 'b300_sglang']);
    expectFullOverlay();
  });

  it('honors i_active on the inference page', () => {
    visit(
      `/infx/inference/deepseek-v4?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_active=b200_sglang`,
    );
    cy.wait('@unofficialRun');
    expectOfficialHardware(['b200_sglang']);
    expectFullOverlay();
    cy.get('[data-testid="chart-legend"] input#checkbox-b200_sglang').should('be.checked');
    cy.get('[data-testid="chart-legend"] input#checkbox-b300_sglang').should('not.be.checked');
  });

  it('honors hw on the embedded chart', () => {
    visit(
      `/embed/model/deepseek-v4?unofficialrun=${OVERLAY_RUN_ID}&scenario=agentic&hw=b200_sglang`,
    );
    cy.wait('@unofficialRun');
    expectOfficialHardware(['b200_sglang']);
    expectFullOverlay();
  });
});

describe('Requested official hardware with best per SKU on by default', () => {
  const slowerConfigs = REAL_CONFIGS.map(
    ([conc, intvty, tput, e2el]): [number, number, number, number] => [
      conc,
      intvty,
      tput / 4,
      e2el,
    ],
  );

  beforeEach(() => {
    interceptOfficial([
      ...b300Rows(null, 'b200'),
      ...b300Rows(null, 'b200', slowerConfigs).map((row) => ({ ...row, framework: 'vllm' })),
    ]);
  });

  it('keeps the best engine per SKU without a request', () => {
    visit('/infx/inference/deepseek-v4?i_seq=agentic-traces');
    expectOfficialHardware(['b200_sglang']);
  });

  it('keeps a requested engine that best per SKU would drop', () => {
    visit('/infx/inference/deepseek-v4?i_seq=agentic-traces&i_active=b200_vllm');
    expectOfficialHardware(['b200_vllm']);
  });

  it('keeps a requested engine on the embedded chart', () => {
    visit('/embed/model/deepseek-v4?scenario=agentic&hw=b200_vllm');
    expectOfficialHardware(['b200_vllm']);
  });
});
