import {
  makeCollectiveXDataset,
  makeCollectiveXContractDataset,
  makeCollectiveXDatasetWithPrefillCohort,
  makeCollectiveXDatasetWithDiagnosticCohort,
  makeCollectiveXDiagnosticDataset,
} from '@/components/collectivex/test-fixture';
import type { CollectiveXDataset } from '@/components/collectivex/types';

type Channel = 'dev-latest' | 'latest-attempt';
const channelUrl = (channel: Channel) => `/collectivex-data/v1/channels/${channel}.json`;

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function installPublication(
  dataset: CollectiveXDataset | Record<string, unknown> = makeCollectiveXDataset(),
  options: { channel?: Channel; digest?: string; delay?: number } = {},
) {
  const channel = options.channel ?? 'dev-latest';
  const body = JSON.stringify(dataset);
  const generatedAt =
    typeof dataset.generated_at === 'string' ? dataset.generated_at : '2026-07-04T01:00:00Z';
  return cy.wrap(sha256(body), { log: false }).then((actualDigest) => {
    const digest = options.digest ?? actualDigest;
    cy.intercept('GET', channelUrl(channel), {
      body: {
        format: 'collectivex.channel.v1',
        channel,
        generated_at: generatedAt,
        dataset: {
          path: `datasets/${digest}/dataset.json`,
          sha256: digest,
          bytes: new TextEncoder().encode(body).length,
        },
      },
    }).as(`collectivexChannel-${channel}`);
    cy.intercept('GET', `/collectivex-data/v1/datasets/${digest}/dataset.json`, {
      body,
      delay: options.delay,
      headers: { 'content-type': 'application/json' },
    }).as(`collectivexDataset-${channel}`);
  });
}

function openCollectiveX() {
  cy.visit('/collectivex');
  cy.wait('@collectivexChannel-dev-latest');
  cy.get('[data-testid="collectivex-display"]').should('be.visible');
}

describe('CollectiveX native publication', () => {
  beforeEach(() => {
    installPublication();
    installPublication(makeCollectiveXDiagnosticDataset(), { channel: 'latest-attempt' });
    openCollectiveX();
  });

  it('defaults to a publisher-controlled, decision-grade cohort', () => {
    cy.get('[data-testid="collectivex-display"]')
      .should('contain.text', 'Promoted v1')
      .and('contain.text', '8/8')
      .and('contain.text', '24')
      .and('contain.text', 'H100 EP8 library comparison');
    cy.get('[data-testid="collectivex-scope-toggle"]')
      .contains('button', 'Controlled')
      .should('have.attr', 'aria-selected', 'true');
    cy.get('[data-testid="collectivex-version-select"]').should('contain.text', 'V1');
    cy.get('[data-testid="collectivex-mode-select"]').should('contain.text', 'Normal');
    cy.get('[data-testid="collectivex-ep-select"]').should('contain.text', 'EP8');
    cy.get('[data-testid="collectivex-fabric-scope-toggle"]')
      .contains('button', 'All')
      .should('have.attr', 'aria-selected', 'true');
    cy.get('[data-testid="collectivex-main-chart"]')
      .should('contain.text', 'Round trip (measured) · decode · p99')
      .and('contain.text', 'H100 EP8 · deepep')
      .and('contain.text', 'H100 EP8 · mori');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 2);
    cy.get('[data-testid="collectivex-chart-semantics"]')
      .should('contain.text', 'Normal')
      .and('contain.text', 'Token-rank payload')
      .and('contain.text', 'Activation-only combine')
      .and('contain.text', '64×8 = 512 samples/component')
      .and('contain.text', '32 synchronized warmups');
    cy.get('[data-testid="collectivex-controlled-stability"]')
      .should('contain.text', 'p50 1.050x ≤ 1.10x')
      .and('contain.text', 'p99 1.100x ≤ 1.25x')
      .and('contain.text', 'stable ordering passed');
    cy.get('[data-testid="collectivex-diagnostic-warning"]').should('not.exist');
    cy.get('[data-testid="collectivex-source-link"]').should(
      'have.attr',
      'href',
      `https://github.com/SemiAnalysisAI/InferenceX/tree/${'a'.repeat(40)}/experimental/CollectiveX`,
    );
    cy.get('[data-testid="collectivex-methodology-link"]')
      .should('contain.text', 'Methodology')
      .and(
        'have.attr',
        'href',
        `https://github.com/SemiAnalysisAI/InferenceX/blob/${'a'.repeat(40)}/experimental/CollectiveX/docs/methodology.md`,
      );
    cy.get('[data-testid="collectivex-cohort-select"]').click();
    cy.get('input[aria-label="Search CollectiveX cohorts"]')
      .should('have.attr', 'placeholder', 'Search cohorts...')
      .type('routing comparison');
    cy.get('[data-slot="select-content"]')
      .should('contain.text', 'Routing sensitivities')
      .and('not.contain.text', 'NVIDIA chip comparison');
    cy.get('button[aria-label="Clear cohort search"]').click();
    cy.get('[data-testid="collectivex-cohort-select"]').click();
  });

  it('serves the bilingual sibling from the same isolated publication', () => {
    cy.visit('/zh/collectivex');
    cy.wait('@collectivexChannel-dev-latest');
    cy.get('[data-testid="zh-tab-intro"]')
      .should('contain.text', 'CollectiveX 通信基准测试')
      .and('contain.text', '专家并行');
    cy.get('[data-testid="collectivex-display"]')
      .should('contain.text', '已发布 v1')
      .and('contain.text', '决策级序列')
      .and('contain.text', '受控队列');
    cy.get('[data-testid="collectivex-methodology-link"]')
      .should('contain.text', '测试方法')
      .and(
        'have.attr',
        'href',
        `https://github.com/SemiAnalysisAI/InferenceX/blob/${'a'.repeat(40)}/experimental/CollectiveX/docs/methodology_zh.md`,
      );
    cy.get('[data-testid="collectivex-channel-toggle"]')
      .contains('button', '已发布')
      .should('have.attr', 'aria-selected', 'true');
    cy.get('[data-testid="collectivex-scope-toggle"]').should('contain.text', '受控对比');
    cy.get('[data-testid="collectivex-operation-select"]').should('contain.text', '往返');
    cy.get('[data-testid="chart-legend"] input[type="text"]')
      .should('have.attr', 'placeholder', '搜索…')
      .and('have.attr', 'aria-label', '搜索图例')
      .type('deepep');
    cy.get('[data-testid="chart-legend"] button[aria-label="清除搜索"]').click();
    cy.get('[data-testid="collectivex-cohort-select"]').should(
      'contain.text',
      'H100 EP8 / 常规 / 域内（scale-up） / 解码 / uniform / 通信库对比（2 个序列）',
    );
    cy.get('[data-testid="collectivex-cohort-select"]').click();
    cy.get('input[aria-label="搜索 CollectiveX 队列"]')
      .should('have.attr', 'placeholder', '搜索队列…')
      .type('路由对比');
    cy.get('[data-slot="select-content"]')
      .should('contain.text', '路由敏感性')
      .and('not.contain.text', '平台对比');
    cy.get('button[aria-label="清除队列搜索"]').click();
    cy.get('[data-testid="collectivex-cohort-select"]').click();
    cy.contains('[role="tab"]', '决策').click();
    cy.get('[data-testid="collectivex-rankings"]')
      .should('contain.text', '排名')
      .and('contain.text', '通信库对比 p99 延迟 T=128')
      .and('contain.text', '解码 T=128 往返 p99 延迟')
      .and('contain.text', '在相同实际系统、工作负载与测量协议下对比通信库')
      .and('not.contain.text', 'Matched H100');
    cy.get('[data-testid="collectivex-comparison-contract"]')
      .should('contain.text', '对比协议')
      .and('contain.text', '保持一致')
      .and('contain.text', '实际系统与拓扑')
      .and('contain.text', '后端实现')
      .and('contain.text', '64 次试验 × 8 次迭代 = 每个分项 512 个样本')
      .and('contain.text', '32 次同步完整往返预热')
      .and('contain.text', 'p50 1.050 倍 ≤ 1.10 倍')
      .and('contain.text', '排名顺序稳定')
      .and('contain.text', '已通过');
    cy.get('[data-testid="collectivex-recommendations"]')
      .should('contain.text', '符合条件的最佳配置')
      .and('contain.text', 'T=128 时 p99 延迟最低')
      .and('contain.text', '受控队列中排名第一的稳定实测往返结果')
      .and('contain.text', '1.0.0 · backend-default · build dddddddd')
      .and('not.contain.text', 'Best p99 latency');
    cy.get('[data-testid="collectivex-cohort-select"]').click();
    cy.contains(
      '[role="option"]',
      'deepep EP8 / 常规 / 域内（scale-up） / 解码 / uniform / 平台对比（2 个序列）',
    ).should('exist');
    cy.contains(
      '[role="option"]',
      '参考实现 EP8 / 常规 / 域内（scale-up） / 解码 / uniform / 参考系统对比（2 个序列）',
    ).should('exist');
    cy.contains(
      '[role="option"]',
      'H100 / deepep / EP8 / 常规 / 域内（scale-up） / 解码 / 路由对比（3 个序列）',
    ).click();
    cy.get('[data-testid="collectivex-sensitivity"]')
      .should('contain.text', '路由敏感性：p99 延迟 T=128')
      .and('contain.text', '实验性')
      .and('contain.text', 'series 00000001');
    cy.contains('[role="tab"]', '证据').click();
    cy.get('[data-testid="collectivex-coverage"]')
      .should('contain.text', '终结状态覆盖')
      .and('contain.text', '后端不支持该平台')
      .and('contain.text', '能力限制')
      .and('contain.text', '每页');
    cy.get('[data-testid="collectivex-coverage-table"] input')
      .should('have.attr', 'placeholder', '搜索…')
      .and('have.attr', 'aria-label', '搜索表格');
    cy.get('[data-testid="collectivex-attempts"]')
      .should('contain.text', '保留的全部尝试')
      .and('contain.text', '后端不支持该平台');
    cy.get('[data-testid="language-toggle"]').should('have.attr', 'href', '/collectivex');
  });

  it('selects exact low-latency EP16 scale-out semantics without mixing normal mode', () => {
    installPublication(makeCollectiveXContractDataset(), { channel: 'latest-attempt' });
    cy.get('[data-testid="collectivex-channel-toggle"]')
      .contains('button', 'Latest attempt')
      .click();
    cy.wait('@collectivexChannel-latest-attempt');

    cy.get('[data-testid="collectivex-mode-select"]').contains('button', 'Low latency').click();
    cy.get('[data-testid="collectivex-ep-select"]').click();
    cy.contains('[role="option"]', 'EP16').click();
    cy.get('[data-testid="collectivex-fabric-scope-toggle"]')
      .contains('button', 'Scale-out')
      .click();

    cy.get('[data-testid="collectivex-phase-toggle"]')
      .find('button')
      .should('have.length', 1)
      .and('contain.text', 'Decode')
      .and('have.attr', 'aria-selected', 'true');
    cy.get('[data-testid="collectivex-chart-semantics"]')
      .should('contain.text', 'Low latency')
      .and('contain.text', 'EP16')
      .and('contain.text', 'Scale-out')
      .and('contain.text', 'Token-expert payload')
      .and('contain.text', 'Gate-weighted combine');
    cy.get('[data-testid="collectivex-main-chart"]')
      .should('contain.text', 'low-latency')
      .and('contain.text', 'h100-nvlink-rdma');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);

    cy.get('[data-testid="collectivex-fabric-scope-toggle"]')
      .contains('button', 'Scale-up')
      .click();
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('not.exist');

    cy.contains('[role="tab"]', 'Evidence').click();
    cy.get('[data-testid="collectivex-coverage-table"]')
      .should('contain.text', 'Mode')
      .and('contain.text', 'EP')
      .and('contain.text', 'Fabric scope')
      .and('contain.text', 'Topology')
      .and('contain.text', 'Low latency')
      .and('contain.text', 'Scale-out')
      .and('contain.text', '2x8 · domain 8 · nvlink+rdma');
  });

  it('labels mixed-scope publisher cohorts without inheriting the first member scope', () => {
    const mixed = makeCollectiveXDataset();
    const cohort = mixed.cohorts.find((item) => item.kind === 'chip')!;
    const first = mixed.series.find((item) => item.series_id === cohort.series_ids[0])!;
    const second = mixed.series.find((item) => item.series_id === cohort.series_ids[1])!;
    first.system = {
      ...first.system,
      sku: 'gb200',
      label: 'NVIDIA GB200 NVL72',
      scope: 'scale-up',
      nodes: 4,
      gpus_per_node: 4,
      scale_up_domain: 72,
      scale_up_transport: 'mnnvl',
      scale_out_transport: null,
      transport: 'mnnvl',
      topology_class: 'gb200-nvl72-mnnvl',
      world_size: 16,
      ep_size: 16,
    };
    second.system = {
      ...second.system,
      scope: 'scale-out',
      nodes: 2,
      scale_out_transport: 'rdma',
      transport: 'nvlink-rdma',
      topology_class: 'h100-nvlink-rdma',
      world_size: 16,
      ep_size: 16,
    };
    installPublication(mixed);
    cy.visit('/zh/collectivex');
    cy.wait('@collectivexChannel-dev-latest');

    cy.get('[data-testid="collectivex-ep-select"]').click();
    cy.contains('[role="option"]', 'EP16').click();
    cy.get('[data-testid="collectivex-cohort-select"]').click();
    cy.contains('[role="option"]', '域内（scale-up） ↔ 跨域（scale-out）').should('exist');
  });

  it('disables source navigation when publication revisions differ', () => {
    const inconsistent = makeCollectiveXDataset();
    inconsistent.series[1].build.source_sha = 'b'.repeat(40);
    installPublication(inconsistent);
    cy.reload();
    cy.wait('@collectivexChannel-dev-latest');

    cy.get('[data-testid="collectivex-source-link"]')
      .should('have.attr', 'aria-disabled', 'true')
      .and('not.have.attr', 'href');
  });

  it('switches to the controlled cohort for the selected phase', () => {
    installPublication(makeCollectiveXDatasetWithPrefillCohort());
    cy.reload();
    cy.wait('@collectivexChannel-dev-latest');

    cy.get('[data-testid="collectivex-phase-toggle"]').contains('button', 'Prefill').click();
    cy.get('[data-testid="collectivex-cohort-select"]').should(
      'contain.text',
      'H100 EP8 prefill library comparison',
    );
    cy.get('[data-testid="collectivex-main-chart"]')
      .should('contain.text', 'Round trip (measured) · prefill · p99')
      .and('contain.text', 'H100 EP8 · deepep')
      .and('contain.text', 'H100 EP8 · mori');
    cy.contains('[role="tab"]', 'Decisions').click();
    cy.get('[data-testid="collectivex-rankings"]')
      .should('contain.text', 'T=512')
      .and('contain.text', 'prefill');
    cy.get('[data-testid="collectivex-recommendations"]').should(
      'contain.text',
      'Best p99 latency at T=512',
    );

    cy.get('[data-testid="collectivex-phase-toggle"]').contains('button', 'Decode').click();
    cy.get('[data-testid="collectivex-cohort-select"]').should(
      'contain.text',
      'H100 EP8 library comparison',
    );
    cy.get('[data-testid="collectivex-rankings"]').should('contain.text', 'T=128');
  });

  it('clears rendered lines when every series is disabled', () => {
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 2);
    cy.get('[data-testid="chart-legend"] input[type="checkbox"]:checked')
      .first()
      .uncheck({ force: true });
    cy.get('[data-testid="chart-legend"] input[type="checkbox"]:checked')
      .first()
      .uncheck({ force: true });
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('not.exist');
  });

  it('restores internal tabs with browser history', () => {
    cy.contains('[role="tab"]', 'Decisions').click();
    cy.location('hash').should('eq', '#tab-decisions');
    cy.contains('[role="tab"]', 'Evidence').click();
    cy.location('hash').should('eq', '#tab-evidence');
    cy.go('back');
    cy.location('hash').should('eq', '#tab-decisions');
    cy.get('[data-testid="collectivex-rankings"]').should('be.visible');
  });

  it('does not query database availability for the isolated page', () => {
    let availabilityRequests = 0;
    cy.intercept('GET', '/api/v1/availability', (request) => {
      availabilityRequests += 1;
      request.reply([]);
    });
    cy.reload();
    cy.wait('@collectivexChannel-dev-latest');
    cy.get('[data-testid="collectivex-display"]').should('be.visible');
    cy.then(() => expect(availabilityRequests).to.eq(0));
  });

  it('keeps decisions and evidence usable on a mobile viewport', () => {
    cy.viewport(390, 844);
    cy.visit('/zh/collectivex');
    cy.wait('@collectivexChannel-dev-latest');
    cy.get('[data-testid="collectivex-channel-toggle"]').should('be.visible');
    cy.get('[data-testid="collectivex-mode-select"]').should('be.visible');
    cy.get('[data-testid="collectivex-ep-select"]').should('be.visible');
    cy.get('[data-testid="collectivex-fabric-scope-toggle"]').should('be.visible');
    cy.get('[data-testid="collectivex-cohort-select"]').should('be.visible');
    cy.get('[data-testid="collectivex-cohort-select"]').click();
    cy.get('input[aria-label="搜索 CollectiveX 队列"]').type('平台对比');
    cy.get('[data-slot="select-content"]').find('[role="option"]').should('have.length', 1);
    cy.get('button[aria-label="清除队列搜索"]').click();
    cy.get('[data-testid="collectivex-cohort-select"]').click();
    cy.get('[data-testid="collectivex-tabs"]').should('be.visible');
    cy.contains('[role="tab"]', '决策').click();
    cy.get('[data-testid="collectivex-recommendations-table"]')
      .should(
        'contain.text',
        '1.0.0 · backend-default · build dddddddd · series 00000001 · official',
      )
      .find('table')
      .parent()
      .should(($container) => {
        expect($container[0].scrollWidth).to.be.greaterThan($container[0].clientWidth);
      })
      .scrollTo('right');
    cy.get('[data-testid="collectivex-recommendations-table"]')
      .find('[data-testid="data-table-pagination-summary"]')
      .should('have.text', '第 1–4 行，共 4 行');
    cy.get('[data-testid="collectivex-recommendations-table"]')
      .find('[data-testid="data-table-page-size"]')
      .should('contain.text', '每页')
      .and('contain.text', '25')
      .and('contain.text', '行');
    cy.get('[data-testid="collectivex-rankings-table"] input').type('正式');
    cy.get('[data-testid="collectivex-rankings-table"]')
      .find('[data-testid="data-table-pagination-summary"]')
      .should('have.text', '第 1–8 行，共 8 行（筛选自 8 行）');

    cy.contains('[role="tab"]', '证据').click();
    cy.get('[data-testid="collectivex-coverage-table"]')
      .find('table')
      .parent()
      .should(($container) => {
        expect($container[0].scrollWidth).to.be.greaterThan($container[0].clientWidth);
      })
      .scrollTo('right');
    const coverageSearch = '[data-testid="collectivex-coverage-table"] input';
    cy.get(coverageSearch).type('解码');
    cy.get('[data-testid="collectivex-coverage-table"]')
      .find('[data-testid="data-table-pagination-summary"]')
      .should('have.text', '第 1–8 行，共 8 行（筛选自 8 行）');
    cy.get(coverageSearch).clear().type('可运行');
    cy.get('[data-testid="collectivex-coverage-table"]')
      .should('not.contain.text', 'MI355X / DeepEP / unsupported')
      .find('[data-testid="data-table-pagination-summary"]')
      .should('have.text', '第 1–7 行，共 7 行（筛选自 8 行）');
    cy.get(coverageSearch).clear().type('成功');
    cy.get('[data-testid="collectivex-coverage-table"]')
      .find('[data-testid="data-table-pagination-summary"]')
      .should('have.text', '第 1–7 行，共 7 行（筛选自 8 行）');
    cy.get('[data-testid="collectivex-attempts-table"] input').type('选择');
    cy.get('[data-testid="collectivex-attempts-table"]')
      .find('[data-testid="data-table-pagination-summary"]')
      .should('have.text', '第 1–24 行，共 24 行（筛选自 24 行）');
    cy.document()
      .its('documentElement')
      .should((element) => {
        expect(element.scrollWidth).to.be.at.most(element.clientWidth);
      });
  });

  it('requires an explicit switch to render diagnostics', () => {
    installPublication(makeCollectiveXDatasetWithDiagnosticCohort());
    cy.reload();
    cy.wait('@collectivexChannel-dev-latest');
    cy.get('[data-testid="collectivex-scope-toggle"]').contains('button', 'Diagnostics').click();

    cy.get('[data-testid="collectivex-diagnostic-warning"]')
      .should('be.visible')
      .and('contain.text', 'excluded from rankings');
    cy.get('[data-testid="collectivex-main-chart"]')
      .should('contain.text', 'H100 EP8 · deepep')
      .and('contain.text', 'H100 EP8 · mori');
    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 2);
    cy.get('[data-testid="collectivex-sku-select"]').should('exist');
  });

  it('shows why a controlled cohort was excluded', () => {
    installPublication(makeCollectiveXDatasetWithDiagnosticCohort());
    cy.reload();
    cy.wait('@collectivexChannel-dev-latest');
    cy.get('[data-testid="collectivex-scope-toggle"]').contains('button', 'Diagnostics').click();
    cy.get('[data-testid="collectivex-cohort-select"]').click();
    cy.contains('[role="option"]', 'H100 EP8 library comparison').click();

    cy.get('[data-testid="collectivex-diagnostic-cohort-reasons"]')
      .should('contain.text', 'unstable-ordering')
      .and('contain.text', 'p50 1.050x')
      .and('contain.text', 'p99 1.100x');
    cy.get('[data-testid="collectivex-main-chart"]')
      .should('contain.text', 'H100 EP8 · deepep')
      .and('contain.text', 'H100 EP8 · mori');
  });

  it('resolves the latest-attempt channel without carrying published data forward', () => {
    cy.get('[data-testid="collectivex-channel-toggle"]')
      .contains('button', 'Latest attempt')
      .click();
    cy.wait('@collectivexChannel-latest-attempt');

    cy.get('[data-testid="collectivex-display"]')
      .should('contain.text', 'diagnostic')
      .and('contain.text', '1/1')
      .and('contain.text', '2')
      .and('contain.text', 'H100 EP8 · nccl-ep')
      .and('not.contain.text', 'H100 EP8 · deepep');
  });

  it('resets diagnostic cohorts and filters when the publication changes', () => {
    installPublication(makeCollectiveXDatasetWithDiagnosticCohort());
    const latest = makeCollectiveXDiagnosticDataset();
    latest.series[0].label = 'MI300X EP8 · nccl-ep';
    latest.series[0].system = {
      ...latest.series[0].system,
      sku: 'mi300x',
      label: 'AMD Instinct MI300X',
      vendor: 'amd',
      topology_class: 'single-node-xgmi',
      transport: 'xgmi',
    };
    latest.coverage[0].sku = 'mi300x';
    installPublication(latest, { channel: 'latest-attempt' });
    cy.reload();
    cy.wait('@collectivexChannel-dev-latest');

    cy.get('[data-testid="collectivex-scope-toggle"]').contains('button', 'Diagnostics').click();
    cy.get('[data-testid="collectivex-sku-select"]').click();
    cy.contains('[role="option"]', 'H100').click();
    cy.get('[data-testid="collectivex-cohort-select"]').click();
    cy.contains('[role="option"]', 'H100 EP8 library comparison').click();
    cy.get('[data-testid="collectivex-sku-select"]').should('not.exist');
    cy.get('[data-testid="collectivex-channel-toggle"]')
      .contains('button', 'Latest attempt')
      .click();
    cy.wait('@collectivexChannel-latest-attempt');

    cy.get('[data-testid="collectivex-cohort-select"]').should(
      'contain.text',
      'All diagnostic evidence',
    );
    cy.get('[data-testid="collectivex-sku-select"]').should('contain.text', 'All');
    cy.get('[data-testid="collectivex-main-chart"]')
      .should('contain.text', 'MI300X EP8 · nccl-ep')
      .and('not.contain.text', 'H100 EP8 · deepep');
  });

  it('never promotes latest-attempt candidates in the browser', () => {
    const unpromoted = makeCollectiveXDataset();
    unpromoted.promotion.status = 'diagnostic';
    installPublication(unpromoted, { channel: 'latest-attempt' });
    cy.get('[data-testid="collectivex-channel-toggle"]')
      .contains('button', 'Latest attempt')
      .click();
    cy.wait('@collectivexChannel-latest-attempt');

    cy.get('[data-testid="collectivex-scope-toggle"]')
      .find('button')
      .should('have.length', 1)
      .and('contain.text', 'Diagnostics');
    cy.get('[data-testid="collectivex-main-chart"]')
      .should('contain.text', 'H100 EP8 · deepep')
      .and('contain.text', 'H100 EP8 · nccl-ep');

    cy.contains('[role="tab"]', 'Decisions').click();
    cy.get('[data-testid="collectivex-unpromoted-decisions"]').should(
      'contain.text',
      'does not drive rankings or recommendations',
    );
    cy.get('[data-testid="collectivex-rankings"]').should('not.exist');
  });

  it('can inspect the latest attempt before the first promotion exists', () => {
    cy.intercept('GET', channelUrl('dev-latest'), {
      statusCode: 404,
      headers: { 'X-CollectiveX-Status': 'channel-unavailable' },
    }).as('missingPromotion');
    cy.reload();
    cy.wait('@missingPromotion');
    cy.get('[data-testid="collectivex-error"]')
      .should('be.visible')
      .and('contain.text', 'No promoted CollectiveX publication is available yet.')
      .and('not.contain.text', 'publication rejected');

    cy.get('[data-testid="collectivex-error-channel-toggle"]')
      .contains('button', 'Latest attempt')
      .click();
    cy.wait('@collectivexChannel-latest-attempt');
    cy.get('[data-testid="collectivex-display"]')
      .should('be.visible')
      .and('contain.text', 'diagnostic');
  });

  it('reports an unavailable GitHub publication source as deployment availability', () => {
    cy.intercept('GET', channelUrl('dev-latest'), {
      statusCode: 503,
      headers: { 'X-CollectiveX-Status': 'source-unavailable' },
    }).as('unavailableSource');
    cy.reload();
    cy.wait('@unavailableSource');
    cy.get('[data-testid="collectivex-error"]')
      .should('be.visible')
      .and('contain.text', 'The GitHub Actions publication source is temporarily unavailable.')
      .and('not.contain.text', 'publication rejected');
    cy.get('[data-testid="collectivex-error-channel-toggle"]').should('not.exist');

    cy.visit('/zh/collectivex');
    cy.wait('@unavailableSource');
    cy.get('[data-testid="collectivex-error"]')
      .should('contain.text', 'GitHub Actions 发布数据源暂时不可用。')
      .and('not.contain.text', 'publication rejected');
  });

  it('renders only publisher-declared rankings and recommendations', () => {
    cy.contains('[role="tab"]', 'Decisions').click();

    cy.get('[data-testid="collectivex-rankings"]')
      .should('contain.text', '3 allocations')
      .and('contain.text', 'deepep')
      .and('contain.text', 'build dddddddd')
      .and('contain.text', 'series 00000001')
      .and('contain.text', 'mori')
      .and('contain.text', 'Mode')
      .and('contain.text', 'EP')
      .and('contain.text', 'Fabric scope')
      .and('contain.text', 'Topology')
      .and('contain.text', 'Point')
      .and('contain.text', 'Scale-up')
      .and('contain.text', '1x8 · domain 8 · nvlink')
      .and('not.contain.text', 'nccl-ep');
    cy.get('[data-testid="collectivex-rankings-table"] tbody tr')
      .first()
      .should('contain.text', 'p50 latency');
    cy.get('[data-testid="collectivex-recommendations"]')
      .should('contain.text', 'Best p99 latency at T=128')
      .and('contain.text', '100 us')
      .and('contain.text', 'deepep')
      .and('contain.text', 'Official')
      .and('contain.text', '1.0.0 · backend-default · build dddddddd · series 00000001 · official');
    cy.get('[data-testid="collectivex-recommendations-table"] tbody tr')
      .first()
      .should('contain.text', 'p50 latency');
    cy.get('[data-testid="collectivex-comparison-contract"]')
      .should('contain.text', 'Comparison contract')
      .and('contain.text', 'Held constant')
      .and('contain.text', 'Realized system and topology')
      .and('contain.text', 'Compared')
      .and('contain.text', 'Backend implementation')
      .and('contain.text', '64 trials × 8 iterations = 512 samples per component')
      .and('contain.text', '32 synchronized round-trip warmups')
      .and('contain.text', 'p99 1.100x ≤ 1.25x')
      .and('contain.text', 'Stable ordering')
      .and('contain.text', 'passed');

    cy.get('[data-testid="collectivex-cohort-select"]').click();
    cy.contains('[role="option"]', 'H100 EP8 routing comparison').click();
    cy.get('[data-testid="collectivex-recommendations"]').should('not.exist');
    cy.get('[data-testid="collectivex-rankings"]').should('contain.text', 'Experimental');
    cy.get('[data-testid="collectivex-sensitivity"]')
      .should('contain.text', 'Routing sensitivity: p99 latency T=128')
      .and('contain.text', '30.0%')
      .and('contain.text', 'series 00000001')
      .and('contain.text', 'series 00000004')
      .and('contain.text', 'Experimental');
    cy.get('[data-testid="collectivex-sensitivity-table"] tbody tr')
      .first()
      .should('contain.text', 'p50 latency');
  });

  it('localizes the bootstrap publication reason in Chinese', () => {
    const bootstrap = makeCollectiveXDiagnosticDataset();
    bootstrap.promotion.reason = 'awaiting-v1-runs';
    installPublication(bootstrap, { channel: 'latest-attempt' });
    cy.visit('/zh/collectivex');
    cy.wait('@collectivexChannel-dev-latest');
    cy.get('[data-testid="collectivex-channel-toggle"]').contains('button', '最新尝试').click();
    cy.wait('@collectivexChannel-latest-attempt');
    cy.get('[data-testid="collectivex-promotion-reason"]')
      .should('contain.text', '等待 CollectiveX v1 运行结果')
      .and('not.contain.text', 'awaiting-v1-runs');
  });

  it('shows terminal coverage and every retained retry', () => {
    cy.contains('[role="tab"]', 'Evidence').click();

    cy.get('[data-testid="collectivex-coverage-table"]')
      .should('contain.text', 'deepep decode')
      .and('contain.text', 'nccl-ep decode')
      .and('contain.text', 'MI355X / DeepEP / unsupported')
      .and('contain.text', 'Mode')
      .and('contain.text', 'EP')
      .and('contain.text', 'Fabric scope')
      .and('contain.text', 'Topology')
      .and('contain.text', 'Normal')
      .and('contain.text', 'Scale-up')
      .and('contain.text', '1x8 · domain 8 · nvlink')
      .and('contain.text', 'runnable')
      .and('contain.text', 'unsupported')
      .and('contain.text', 'capability')
      .and('contain.text', 'success');
    cy.get('[data-testid="collectivex-provenance"]')
      .should('contain.text', 'Source bundles')
      .and('contain.text', 'a'.repeat(64))
      .and('contain.text', 'b'.repeat(64))
      .and('contain.text', 'c'.repeat(64));

    cy.get('[data-testid="collectivex-channel-toggle"]')
      .contains('button', 'Latest attempt')
      .click();
    cy.wait('@collectivexChannel-latest-attempt');
    cy.contains('[role="tab"]', 'Evidence').click();
    cy.get('[data-testid="collectivex-attempts-table"]')
      .should('contain.text', 'timeout')
      .and('contain.text', 'execution-timeout')
      .and('contain.text', 'failed')
      .and('contain.text', 'retained')
      .and('contain.text', 'allocation selection')
      .and('contain.text', 'terminal selection')
      .and('contain.text', 'Attempt ID')
      .and('contain.text', 'nccl-ep decode')
      .and('contain.text', 'Failure mode');
    cy.get('[data-testid="collectivex-attempts-table"] details')
      .filter(':has([data-testid="collectivex-evidence-id"])')
      .first()
      .find('summary')
      .click();
    cy.get('[data-testid="collectivex-attempts-table"] [data-testid="collectivex-evidence-id"]')
      .first()
      .invoke('text')
      .then((evidenceId) => {
        const id = evidenceId.trim();
        cy.get('[data-testid="collectivex-attempts-table"] input').clear().type(id);
        cy.get('[data-testid="collectivex-attempts-table"] tbody tr').should('have.length', 1);
        cy.get('[data-testid="collectivex-attempts-table"] input').clear().type(id.slice(-8));
        cy.get('[data-testid="collectivex-attempts-table"]').should('contain.text', id.slice(-8));
      });
    cy.get('[data-testid="collectivex-provenance"]')
      .should('contain.text', 'latest-attempt')
      .and('contain.text', 'Dataset SHA-256');
  });

  it('keeps nullable isolated components unavailable', () => {
    cy.get('[data-testid="collectivex-operation-select"]').click();
    cy.contains('[role="option"]', 'Dispatch').click();

    cy.get('[data-testid="collectivex-explorer-chart"] .line-path').should('have.length', 1);
    cy.get('[data-testid="collectivex-main-chart"]').should(
      'contain.text',
      'Unavailable components remain null',
    );
  });

  it('renders loading while resolving immutable bytes', () => {
    const delayed = makeCollectiveXDiagnosticDataset();
    delayed.generated_at = '2026-07-04T02:00:00Z';
    installPublication(delayed, { channel: 'latest-attempt', delay: 750 });
    cy.get('[data-testid="collectivex-channel-toggle"]')
      .contains('button', 'Latest attempt')
      .click();
    cy.get('[data-testid="collectivex-loading"]').should('be.visible');
    cy.wait('@collectivexDataset-latest-attempt');
    cy.get('[data-testid="collectivex-display"]').should('be.visible');
  });

  it('fails closed on digest or schema mismatch', () => {
    installPublication(makeCollectiveXDataset(), { digest: 'f'.repeat(64) });
    cy.reload();
    cy.wait('@collectivexChannel-dev-latest');
    cy.get('[data-testid="collectivex-error"]')
      .should('be.visible')
      .and('contain.text', 'SHA-256 does not match');

    const malformed = makeCollectiveXDataset() as unknown as Record<string, unknown>;
    malformed.browser_ranking = true;
    installPublication(malformed);
    cy.reload();
    cy.wait('@collectivexChannel-dev-latest');
    cy.get('[data-testid="collectivex-error"]')
      .should('be.visible')
      .and('contain.text', 'unknown field browser_ranking');
  });
});
