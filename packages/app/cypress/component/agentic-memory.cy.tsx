import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryView } from '@/components/inference/agentic-point/memory-view';
import type { BenchmarkSibling } from '@/hooks/api/use-benchmark-siblings';
import { parseAgenticMemory } from '@semianalysisai/inferencex-db/lib/agentic-memory';

const cssAnchor = document.createElement('noscript');
cssAnchor.id = '__next_css__DO_NOT_USE__';
document.head.append(cssAnchor);
require('@/app/globals.css');

const text =
  '(Worker_TP0 pid=1) Free memory on device (264/268 GiB) on startup. Actual usage is 205.08 GiB for weight, 3.75 GiB for peak activation, 1.63 GiB for non-torch memory, and 0.14 GiB for CUDAGraph memory. Current kv cache memory in use is 43.85 GiB.';
const report = {
  id: 1,
  conc: 8,
  date: '2026-08-21',
  model: 'dsv4',
  framework: 'vllm',
  hardware: 'b300',
  image: null,
  disagg: false,
  status: 'reported',
  files: [],
  filesOmitted: 0,
  kvPoolTokens: null,
  kvUsageMaxFraction: 0.9,
  ranks: parseAgenticMemory('vllm', [{ file: 'server.log', text, truncated: false }]),
};
function mount(locale = 'en') {
  const siblings = [{ id: 1, conc: 8, disagg: false }] as BenchmarkSibling[];
  cy.mount(
    <PathnameContext.Provider
      value={locale === 'zh' ? '/zh/inference/agentic/1' : '/inference/agentic/1'}
    >
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryView id={1} siblings={siblings} />
      </QueryClientProvider>
    </PathnameContext.Provider>,
  );
}
describe('AgentX memory view', () => {
  it('renders parsed data, switches units both ways and exposes evidence', () => {
    cy.intercept('GET', '/api/v1/agentic-memory?id=1', report);
    mount();
    cy.contains('205.08 GiB').should('be.visible');
    cy.contains('Unit').find('select').select('%');
    cy.contains('76.52 %').should('be.visible');
    cy.contains('Unit').find('select').select('GiB');
    cy.contains('205.08 GiB').should('be.visible');
    cy.contains('summary', 'Evidence').click();
    cy.contains('pre', 'Current kv cache memory in use is 43.85 GiB').should('be.visible');
  });
  it('keeps source errors retryable, distinct from missing telemetry', () => {
    cy.intercept('GET', '/api/v1/agentic-memory?id=1', { statusCode: 500 });
    mount();
    cy.get('[data-testid="memory-query-error"]').should('be.visible');
    cy.intercept('GET', '/api/v1/agentic-memory?id=1', { ...report, status: 'missing', ranks: [] });
    cy.contains('button', 'Retry').click();
    cy.contains('No supported allocation report').should('be.visible');
    cy.get('[data-testid="memory-comparison"]').should('not.exist');
  });
  it('renders Chinese at mobile width without document overflow', () => {
    cy.viewport(375, 812);
    cy.intercept('GET', '/api/v1/agentic-memory?id=1', report);
    mount('zh');
    cy.contains('不同并发数下的 GPU 显存').should('be.visible');
    cy.contains('单位').find('select').select('%');
    cy.contains('76.52 %').should('be.visible');
    cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(375));
  });
});
