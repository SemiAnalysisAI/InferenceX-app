import { expectNoPageOverflow, unlockAgenticGate } from '../support/e2e';

const DATASET = {
  id: 'agentx-v1-full',
  slug: 'agentx-v1-full',
  label: 'AgentX v1.0 (full)',
  variant: 'full',
  description: 'The complete AgentX v1.0 replay set.',
  hf_url: null,
  license: 'apache-2.0',
  conversation_count: 393,
  summary: {
    medianRequestsPerConversation: 20,
    meanRequestsPerConversation: 24,
    mainTurns: 7800,
    subagentGroups: 1300,
    cachedPct: 0.84,
    totalIn: 56_000_000,
    totalOut: 175_000,
  },
  ingested_at: '2026-06-21T00:00:00Z',
};

const ROUTE_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
] as const;

describe('AgentX dataset methodology', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/datasets', { statusCode: 200, body: [DATASET] });
  });

  it('explains the source, replay sequence, controls, and interpretation in English', () => {
    cy.visit('/agentx', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentx-methodology"]').within(() => {
      cy.get('h1').should('have.text', 'AgentX Benchmark Datasets');
      cy.get('[data-testid="agentx-methodology-step"]').should('have.length', 4);
      cy.get('[data-testid="agentx-methodology-step"] h3').then(($headings) => {
        expect([...$headings].map((heading) => heading.textContent)).to.deep.equal([
          'Capture',
          'Transform',
          'Reconstruct',
          'Replay and measure',
        ]);
      });
      cy.contains('393 Claude Code sessions').should('be.visible');
      cy.contains('Claude Code 2.1.139 or newer').should('be.visible');
      cy.contains('SPEED-Bench').should('be.visible');
      cy.contains('Its synthetic payloads do not support model-quality evaluation.').should(
        'be.visible',
      );
      cy.get('[data-testid="agentx-methodology-cta"]')
        .should('contain.text', 'Read the full methodology')
        .and('have.attr', 'href', '/agentx/methodology');
      cy.get('[data-testid="agentx-results-cta"]')
        .should('contain.text', 'View AgentX Performance Results')
        .and('have.attr', 'href', '/inference');
    });
  });

  it('ships the same methodology on the Simplified Chinese page', () => {
    cy.visit('/zh/agentx', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentx-methodology"]').within(() => {
      cy.get('h1').should('have.text', 'AgentX 基准测试数据集');
      cy.get('[data-testid="agentx-methodology-step"]').should('have.length', 4);
      cy.contains('AgentX 如何构建一次回放').should('be.visible');
      cy.contains('回放控制').should('be.visible');
      cy.contains('参与者自愿提供的 Claude Code 会话').should('be.visible');
      cy.contains('会话数').should('be.visible');
      cy.contains('单请求 input token 数中位数').should('be.visible');
      cy.contains('单请求 output token 数中位数').should('be.visible');
      cy.contains('对外报告的指标仅覆盖一小时 profiling 窗口').should('be.visible');
      cy.contains('合成 payload 不能用于模型质量评估').should('be.visible');
      cy.contains('对于没有标准 DRAM 配置的服务器，可用 DRAM 上限为 3 TB').should('be.visible');
      cy.get('[data-testid="agentx-methodology-cta"]')
        .should('contain.text', '查看完整测试方法')
        .and('have.attr', 'href', '/zh/agentx/methodology');
      cy.get('[data-testid="agentx-results-cta"]')
        .should('contain.text', '查看 AgentX 性能结果')
        .and('have.attr', 'href', '/zh/inference');
    });

    cy.get('a[href="/zh/agentx/agentx-v1-full"]').within(() => {
      cy.contains('会话数').should('be.visible');
      cy.contains('单会话请求数中位数').should('be.visible');
      cy.contains('单会话平均请求数').should('be.visible');
      cy.contains('main agent 轮次').should('be.visible');
      cy.contains('subagent 组').should('be.visible');
      cy.contains('cached input 占比').should('be.visible');
      cy.contains('input token 总数').should('be.visible');
      cy.contains('output token 总数').should('be.visible');
    });
  });

  it('publishes the full English methodology with sourced figures and locale pairing', () => {
    cy.visit('/agentx/methodology', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentx-methodology-article"]').within(() => {
      cy.get('h1').should('have.text', 'AgentX Methodology');
      cy.contains('393 sessions built on June 21, 2026').should('be.visible');
      cy.contains('directed acyclic graph (DAG)').should('be.visible');
      cy.contains('following one-hour profiling window').should('be.visible');
      cy.contains('capped at 3 TB').should('be.visible');
      cy.get('figure[data-testid^="agentx-methodology-figure-"]').should('have.length', 21);
      cy.get('[data-testid="agentx-methodology-figure-corpus"]')
        .should('contain.text', 'View full-resolution image')
        .parent('a')
        .should('have.attr', 'href', '/images/agentx-methodology/corpus-scale.png')
        .and('have.attr', 'target', '_blank');
      cy.get('[data-testid="agentx-methodology-figure-corpus"] img')
        .invoke('attr', 'src')
        .should('include', 'q=100');
      [
        'requestDistributions256k',
        'subagentDistributions256k',
        'replayJoined',
        'replayFlatspawn',
        'replaySidecars',
      ].forEach((figure) => {
        cy.get(`[data-testid="agentx-methodology-figure-${figure}"] img`)
          .should('be.visible')
          .invoke('attr', 'alt')
          .should('not.be.empty');
      });
      cy.get('a[href="https://arxiv.org/abs/2604.09557"]').should('exist');
    });

    cy.get('[data-testid="language-toggle"]').should('have.attr', 'href', '/zh/agentx/methodology');
    cy.get('link[rel="alternate"][hreflang="en"]').should('exist');
    cy.get('link[rel="alternate"][hreflang="zh-CN"]').should('exist');
  });

  it('publishes the natural Simplified Chinese methodology sibling', () => {
    cy.visit('/zh/agentx/methodology', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentx-methodology-article"]').within(() => {
      cy.get('h1').should('have.text', 'AgentX 测试方法');
      cy.contains('2026 年 6 月 21 日构建').should('be.visible');
      cy.contains('有向无环图（DAG）').should('be.visible');
      cy.contains('上限为 3 TB').should('be.visible');
      cy.get('figure[data-testid^="agentx-methodology-figure-"]').should('have.length', 21);
      cy.get('[data-testid="agentx-methodology-figure-corpus"]')
        .should('contain.text', '查看原始分辨率图片')
        .parent('a')
        .should('have.attr', 'href', '/images/agentx-methodology/corpus-scale.png');
    });

    cy.get('[data-testid="language-toggle"]').should('have.attr', 'href', '/agentx/methodology');
  });

  it('renders the landing and methodology click path at 1440px and 375px in both locales', () => {
    for (const viewport of ROUTE_VIEWPORTS) {
      for (const locale of ['', '/zh']) {
        cy.viewport(viewport.width, viewport.height);
        cy.visit(`${locale}/agentx`, { onBeforeLoad: unlockAgenticGate });
        cy.get('[data-testid="agentx-methodology"]').should('be.visible');
        cy.get('[data-testid="agentx-methodology-cta"]').should(
          'have.attr',
          'href',
          `${locale}/agentx/methodology`,
        );
        cy.get('[data-testid="agentx-telemetry-callout"]').should('exist');
        cy.get('[data-testid="agentx-optimizations-callout"]').should('exist');
        expectNoPageOverflow();

        cy.visit(`${locale}/agentx/methodology`, { onBeforeLoad: unlockAgenticGate });
        cy.get('[data-testid="agentx-methodology-article"]').should('be.visible');
        cy.get('figure[data-testid^="agentx-methodology-figure-"]').should('have.length', 21);
        cy.get('[data-testid="language-toggle"]').should(
          'have.attr',
          'href',
          locale === '/zh' ? '/agentx/methodology' : '/zh/agentx/methodology',
        );
        expectNoPageOverflow();
      }
    }
  });

  it('permanently redirects legacy dataset routes without dropping path or query', () => {
    cy.request({
      url: '/datasets/test-set/conversations/abc?turn=3',
      followRedirect: false,
    }).then((response) => {
      expect(response.status).to.eq(308);
      expect(response.headers.location).to.eq('/agentx/test-set/conversations/abc?turn=3');
    });

    cy.request({ url: '/zh/datasets', followRedirect: false }).then((response) => {
      expect(response.status).to.eq(308);
      expect(response.headers.location).to.eq('/zh/agentx');
    });
  });
});

describe('AgentX quickstart', () => {
  for (const prefix of ['', '/zh']) {
    it(`opens the guide from AgentX and the About FAQ (${prefix || 'en'})`, () => {
      for (const entry of ['/agentx', '/about']) {
        cy.visit(`${prefix}${entry}`);
        cy.get('[data-testid="agentx-quickstart-callout"]').within(() => {
          cy.contains('code', "pip install 'agentx-harness==1.0.7'").should('exist');
          cy.get(`a[href="${prefix}/agentx/quickstart"]`).click();
        });
        cy.location('pathname').should('eq', `${prefix}/agentx/quickstart`);
        cy.get('[data-testid="agentx-quickstart-article"]').should('be.visible');
      }
    });

    it(`copies the complete command and optional headers on mobile (${prefix || 'en'})`, () => {
      cy.viewport(375, 812);
      cy.visit(`${prefix}/agentx/quickstart`, {
        onBeforeLoad(win) {
          Object.defineProperty(win.navigator, 'clipboard', {
            configurable: true,
            value: { writeText: cy.stub().as('writeText').resolves() },
          });
        },
      });
      expectNoPageOverflow();
      cy.get('#run code')
        .invoke('text')
        .then((command) => {
          expect(command).to.include('--url "http://127.0.0.1:8000"');
          expect(command).to.include('--model "$HUGGINGFACE_MODEL_NAME"');
          expect(command).to.include('--concurrency "$CONC_SESSIONS"');
          expect(command).to.include('--public-dataset "semianalysis_cc_traces_weka_062126"');
          expect(command).to.include('--output-artifact-dir "output_dir_results"');
          cy.get('#run button').click();
          cy.get('@writeText').should('have.been.calledWithExactly', command);
        });
      cy.get('#routing code')
        .invoke('text')
        .then((flags) => {
          expect(flags).to.include('AIPERF_HTTP_X_DYNAMO_SESSION_ID_FROM_CORRELATION_ID=true');
          expect(flags).to.include('AIPERF_HTTP_X_SESSION_ID_FROM_CORRELATION_ID=true');
          expect(flags).to.include('X-Dynamo-Parent-Session-ID');
          cy.get('#routing button').click();
          cy.get('@writeText').should('have.been.calledWithExactly', flags);
        });
      cy.get('details summary').click();
      cy.get('details code').should('be.visible').and('contain', 'python3.11 -m venv .venv');
      cy.get('details summary').click();
      cy.get('details').should('not.have.attr', 'open');
      cy.get('link[rel="canonical"]').should(
        'have.attr',
        'href',
        `https://inferencex.semianalysis.com${prefix}/agentx/quickstart`,
      );
      cy.get('link[hreflang="zh-CN"]').should(
        'have.attr',
        'href',
        'https://inferencex.semianalysis.com/zh/agentx/quickstart',
      );
      expectNoPageOverflow();
    });
  }

  it('keeps the command selectable when clipboard access is denied', () => {
    cy.visit('/agentx/quickstart', {
      onBeforeLoad(win) {
        Object.defineProperty(win.navigator, 'clipboard', {
          configurable: true,
          value: { writeText: cy.stub().rejects(new Error('Clipboard denied')) },
        });
      },
    });
    cy.get('#run button').click();
    cy.get('#run [role="status"]').should('be.visible').and('contain', 'Select the code');
    cy.get('#run pre').should('be.visible').and('have.attr', 'tabindex', '0');
  });
});
