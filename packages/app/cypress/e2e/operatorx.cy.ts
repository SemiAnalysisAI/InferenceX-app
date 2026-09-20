import { readOperatorXBundle, object } from '@semianalysisai/inferencex-db/operatorx/reader';
import {
  makeOperatorXBundle,
  makeOperatorXAttentionBundle,
  makeOperatorXMoeBundle,
} from '@semianalysisai/inferencex-db/operatorx/test-fixture';
const bundle = makeOperatorXBundle();
const cell = object((object(bundle.manifest).include as unknown[])[0]);
const first = object((cell.cases as unknown[])[0]);
const second = structuredClone(first);
object(object(second.shape).args).m = 512;
(cell.cases as unknown[]).push(second);
const doc = object(bundle.shards[0].docs[0]);
(doc.rows as unknown[]).push({
  op: { ...object(second.shape), backend: 'torch' },
  testlist: 'gemm',
  status: 'unsupported',
  metrics: {},
  message: 'dtype unsupported on this device',
});
const dataset = readOperatorXBundle(bundle);
function install() {
  cy.intercept('GET', '/api/v1/operatorx/runs', {
    runs: [dataset.run],
    discovery_complete: true,
  }).as('operatorxRuns');
  cy.intercept('GET', '/api/v1/operatorx/runs/123', dataset).as('operatorxRun');
}
describe('OperatorX hidden GEMM explorer', () => {
  beforeEach(install);
  it('shows per-GPU TFLOPS and failure coverage, filters results, and lives beside CollectiveX in Hidden', () => {
    cy.visit('/operatorx');
    cy.wait('@operatorxRun');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '2.00 TFLOPS / GPU');
    cy.get('[data-testid="operatorx-requested"]').should('have.text', '2');
    cy.get('[data-testid="operatorx-unsupported"]').should('have.text', '1');
    cy.get('[data-testid="operatorx-chart"] circle.point').should('have.length', 1);
    cy.get('select[aria-label="Status"]').select('unsupported');
    cy.get('[data-testid="operatorx-results"]')
      .should('contain.text', '512 × 1000 × 1000')
      .and('contain.text', '—');
    cy.get('[data-testid="operatorx-results"] summary').click();
    cy.get('[data-testid="operatorx-results"]').should(
      'contain.text',
      'dtype unsupported on this device',
    );
    cy.window().then((win) => {
      for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown']) {
        win.dispatchEvent(new win.KeyboardEvent('keydown', { key }));
      }
    });
    cy.contains('button', 'Hidden').click();
    cy.get('[data-slot="popover-content"]').within(() => {
      cy.contains('a', 'OperatorX').should('have.attr', 'href', '/operatorx');
      cy.contains('a', 'CollectiveX').should('have.attr', 'href', '/collectivex');
    });
  });
  it('renders translated controls and the same measured value on mobile', () => {
    cy.viewport(390, 844);
    cy.visit('/zh/operatorx?run=123');
    cy.wait('@operatorxRun');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '2.00 TFLOPS / GPU');
    cy.get('select[aria-label="状态"]').should('have.value', 'ok');
    cy.get('select[aria-label="指标"]').select('latency');
    cy.get('[data-testid="operatorx-chart"]').should('contain.text', '延迟（µs）');
  });
});

describe('OperatorX attention selection', () => {
  it('shows MHA and MLA throughput, switches to latency, and preserves complete shapes', () => {
    const mixedBundle = makeOperatorXAttentionBundle();
    const mixedCell = object((object(mixedBundle.manifest).include as unknown[])[0]);
    const cases = mixedCell.cases as unknown[];
    const fasterDecode = structuredClone(object(cases[1]));
    object(object(fasterDecode.shape).args).batch_size = 1;
    cases.push(fasterDecode);
    (object(mixedBundle.shards[0].docs[0]).rows as unknown[]).push({
      op: { ...object(fasterDecode.shape), backend: 'torch' },
      testlist: 'attention',
      status: 'ok',
      metrics: { latency_us: 10 },
    });
    const mixed = readOperatorXBundle(mixedBundle);
    const attentionOnly = {
      ...mixed,
      run: { ...mixed.run, run_id: '456', requested: 1, measured: 1 },
      points: mixed.points.filter(
        (p) => p.type === 'attention_mha' && p.attention?.batch_size === 8,
      ),
    };
    cy.intercept('GET', '/api/v1/operatorx/runs/456', attentionOnly);
    cy.intercept('GET', '/api/v1/operatorx/runs', {
      runs: [mixed.run, attentionOnly.run],
      discovery_complete: true,
    });
    cy.intercept('GET', '/api/v1/operatorx/runs/123', mixed);
    cy.visit('/operatorx?run=123');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '2.00 TFLOPS / GPU');
    cy.get('select[aria-label="Operator"]').select('attention_mha');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '42.95 TFLOPS / GPU');
    cy.get('[data-testid="operatorx-results"]').should('contain.text', '42.95');
    cy.get('select[aria-label="Metric"]').select('latency');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '10.00 µs');
    cy.get('[data-testid="operatorx-results"] tbody tr').first().should('contain.text', 'B=1 ·');
    cy.get('select[aria-label="Metric"]').select('tflops');
    cy.get('[data-testid="operatorx-results"] tbody tr').first().should('contain.text', 'B=8 ·');
    cy.get('[data-testid="operatorx-chart"]').should('contain.text', 'TFLOPS / GPU');
    cy.get('select[aria-label="Metric"]')
      .should('have.value', 'tflops')
      .find('option')
      .should('have.length', 2);
    cy.get('[data-testid="operatorx-chart"] circle.point').should('have.length', 2);
    cy.get('[data-testid="operatorx-results"]').should(
      'contain.text',
      'B=8 · Q=1 KV=4096 · H=32/8 · D=128/128',
    );
    cy.get('select[aria-label="Operator"]').select('attention_mla');
    cy.get('[data-testid="operatorx-results"]').should('contain.text', 'D=192/128 · R=512');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '488.06 TFLOPS / GPU');
    cy.get('select[aria-label="Metric"]').select('latency');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '5.50 µs');
    cy.get('[data-testid="operatorx-chart"]').should('contain.text', 'Latency (µs)');
    cy.get('select[aria-label="Metric"]').select('tflops');
    cy.get('select[aria-label="Operator"]').select('gemm');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '2.00 TFLOPS / GPU');
    cy.get('select[aria-label="Precision (A / B → output)"]').select('bf16 / bf16 → bf16');
    cy.get('select[aria-label="Run"]').select('456');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '42.95 TFLOPS / GPU');
    cy.get('select[aria-label="Operator"]').should('have.value', 'attention_mha');
  });
  it('defaults an attention-only run to throughput and supports latency in Chinese on mobile', () => {
    const mixed = readOperatorXBundle(makeOperatorXAttentionBundle());
    mixed.points = mixed.points.filter((p) => p.type === 'attention_mha');
    mixed.run.requested = 1;
    mixed.run.measured = 1;
    cy.intercept('GET', '/api/v1/operatorx/runs', { runs: [mixed.run], discovery_complete: true });
    cy.intercept('GET', '/api/v1/operatorx/runs/123', mixed);
    cy.viewport(390, 844);
    cy.visit('/zh/operatorx?run=123');
    cy.get('select[aria-label="算子"]').should('have.value', 'attention_mha');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '42.95 TFLOPS / GPU');
    cy.get('select[aria-label="精度（Q / K / V → 输出）"]').should(
      'contain.text',
      'bf16 / bf16 / bf16 → bf16',
    );
    cy.contains('Attention 实测性能').should('be.visible');
    cy.get('select[aria-label="指标"]').select('latency');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '12.50 µs');
    cy.get('[data-testid="operatorx-results"]').should('contain.text', '42.95');
  });
});

describe('OperatorX routed MoE selection', () => {
  beforeEach(() => {
    const mixed = readOperatorXBundle(makeOperatorXMoeBundle());
    cy.intercept('GET', '/api/v1/operatorx/runs', { runs: [mixed.run], discovery_complete: true });
    cy.intercept('GET', '/api/v1/operatorx/runs/123', mixed);
  });
  it('shows measured routed TFLOPS, local shard dimensions, and latency after changing operator', () => {
    cy.visit('/operatorx?run=123');
    cy.get('select[aria-label="Operator"]').select('moe_gemm');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '32.21 TFLOPS / GPU');
    cy.get('[data-testid="operatorx-results"]')
      .should('contain.text', 'Controlled routed expert profile')
      .and('contain.text', 'I=1024/2048')
      .and('contain.text', 'E=8/64')
      .and('contain.text', 'EP=8 TP=2');
    cy.get('select[aria-label="Precision (activation / weight)"]').select('bf16 / bf16');
    cy.get('select[aria-label="Backend"]').select('vllm');
    cy.get('[data-testid="operatorx-chart"] circle.point').should('have.length', 1);
    cy.get('[data-testid="operatorx-chart"]').should('contain.text', 'Local tokens');
    cy.get('select[aria-label="Metric"]').select('latency');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '100.00 µs');
    cy.get('select[aria-label="Operator"]').select('attention_mha');
    cy.get('select[aria-label="Metric"]').should('have.value', 'latency');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '12.50 µs');
  });
  it('preserves measured values and the profile scope in Chinese on mobile', () => {
    cy.viewport(390, 844);
    cy.visit('/zh/operatorx?run=123');
    cy.get('select[aria-label="算子"]').select('moe_gemm');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '32.21 TFLOPS / GPU');
    cy.get('select[aria-label="精度（激活 / 权重）"]').should('contain.text', 'bf16 / bf16');
    cy.contains('路由 MoE 实测性能').should('be.visible');
    cy.contains('预先生成的本地路由').should('be.visible');
    cy.get('select[aria-label="指标"]').select('latency');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '100.00 µs');
  });
});
