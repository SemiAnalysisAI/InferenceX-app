import { useState } from 'react';
import { EngineComparisonConfirmation } from '@/components/inference/ui/engine-comparison-confirmation';

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
});
