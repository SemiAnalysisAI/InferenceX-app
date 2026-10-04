import { useState } from 'react';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { EngineComparisonConfirmation } from '@/components/engine-comparison-confirmation';

function Harness({ confirm, cancel }: { confirm: () => void; cancel: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <EngineComparisonConfirmation
      open={open}
      onConfirm={() => {
        confirm();
        setOpen(false);
      }}
      onCancel={() => {
        cancel();
        setOpen(false);
      }}
    />
  );
}

describe('Engine comparison confirmation', () => {
  it('requires an affirmative agreement and focuses Cancel first', () => {
    cy.mount(<Harness confirm={cy.stub().as('confirm')} cancel={cy.stub().as('cancel')} />);
    cy.focused().should('have.text', 'Cancel');
    cy.get('[role="dialog"] p').should(
      'have.text',
      'By continuing to display vLLM & SGLang on the same hardware SKU, I agree not to use this comparison to start vLLM vs SGLang drama on twitter or XHS or other forums',
    );
    cy.get('@confirm').should('not.have.been.called');
    cy.contains('button', 'I agree, show both').click();
    cy.get('@confirm').should('have.been.calledOnce');
    cy.get('@cancel').should('not.have.been.called');
    cy.get('[role="dialog"]').should('not.exist');
  });
  it('treats Escape as cancellation, not acceptance', () => {
    cy.mount(<Harness confirm={cy.stub().as('confirm')} cancel={cy.stub().as('cancel')} />);
    cy.get('[role="dialog"]').type('{esc}');
    cy.get('@cancel').should('have.been.calledOnce');
    cy.get('@confirm').should('not.have.been.called');
  });
  it('provides the same warning and agreement in Chinese', () => {
    cy.mount(
      <PathnameContext.Provider value="/zh/inference">
        <Harness confirm={cy.stub().as('confirm')} cancel={cy.stub().as('cancel')} />
      </PathnameContext.Provider>,
    );
    cy.get('[role="dialog"] p').should(
      'have.text',
      '继续显示同一硬件 SKU 上的 vLLM 和 SGLang，即表示我同意不利用这组对比在 Twitter、小红书或其他论坛上挑起 vLLM 与 SGLang 之间的争论。',
    );
    cy.contains('button', '我同意，同时显示').click();
    cy.get('@confirm').should('have.been.calledOnce');
  });
});
