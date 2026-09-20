import { useState } from 'react';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import VideoApiReference from '@/components/video-benchmark/VideoApiReference';
import { registerAnalyticsClient } from '@/lib/analytics';

/** Owns the price like VideoDashboard does and exposes it, plus an external setter. */
function Harness({ initial, pathname = '/video' }: { initial: number; pathname?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <PathnameContext.Provider value={pathname}>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <VideoApiReference value={value} onChange={setValue} />
      </div>
      <output data-testid="api-price-value">{value}</output>
      <button type="button" data-testid="api-price-external" onClick={() => setValue(0.047)}>
        external
      </button>
    </PathnameContext.Provider>
  );
}
const input = () => cy.get('[data-testid="video-api-price"]');
const value = () => cy.get('[data-testid="api-price-value"]');
const caption = () => cy.get('[data-testid="video-api-reference-caption"]');

describe('VideoApiReference', () => {
  it('shows the dated reference with its source and applies valid prices as typed', () => {
    cy.mount(<Harness initial={0.034} />);
    input().should('have.value', '0.034').and('have.attr', 'step', '0.001');
    caption()
      .should('contain', 'Reference $0.034/video-s')
      .and('contain', 'listed range $0.034–$0.047')
      .and('contain', 'captured 2026-09-19')
      .and('contain', 'Source: MiniMax Design · H3 768p subscription tier')
      .and('contain', 'not verified on the pay-as-you-go page')
      .and('contain', 'List price, not realized revenue');
    input().clear().type('0.05');
    value().should('have.text', '0.05');
  });
  it('keeps the last valid price while the box is empty or zero and snaps back on blur', () => {
    cy.mount(<Harness initial={0.034} />);
    input().clear();
    value().should('have.text', '0.034');
    input().type('0');
    value().should('have.text', '0.034');
    input().blur().should('have.value', '0.034');
  });
  it('resets to the reference, adopts external values and tracks committed changes', () => {
    const capture = cy.stub().as('capture');
    registerAnalyticsClient({ capture });
    cy.mount(<Harness initial={0.05} />);
    input().should('have.value', '0.05');
    cy.get('[data-testid="video-api-price-reset"]').click();
    value().should('have.text', '0.034');
    input().should('have.value', '0.034');
    cy.get('@capture').should('have.been.calledWith', 'video_api_price_changed', {
      value: '0.034',
      reset: true,
    });
    cy.get('[data-testid="api-price-external"]').click();
    input().should('have.value', '0.047');
    input().clear().type('0.04').blur();
    value().should('have.text', '0.04');
    cy.get('@capture').should('have.been.calledWith', 'video_api_price_changed', {
      value: '0.04',
    });
  });
  it('renders Chinese copy under /zh', () => {
    cy.mount(<Harness initial={0.034} pathname="/zh/video" />);
    cy.contains('label', 'API 参考价（$/video-s）').should('exist');
    cy.contains('button', '重置').should('exist');
    caption()
      .should('contain', '参考值 $0.034/video-s')
      .and('contain', '标价区间 $0.034–$0.047')
      .and('contain', '采集于 2026-09-19')
      .and('contain', '来源：MiniMax Design · H3 768p 订阅档')
      .and('contain', '此处为 API 标价，而非实际收入');
  });
});
