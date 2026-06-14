import { FEEDBACK_SUBMITTED_EVENT, FeedbackForm } from '@/components/feedback-modal';

describe('FeedbackForm', () => {
  it('renders all three input fields, a dismiss button, and a submit button', () => {
    cy.mount(<FeedbackForm onDismiss={cy.stub()} />);
    cy.get('[data-testid="feedback-doing-well"]').should('be.visible');
    cy.get('[data-testid="feedback-doing-poorly"]').should('be.visible');
    cy.get('[data-testid="feedback-want-to-see"]').should('be.visible');
    cy.get('[data-testid="feedback-modal-dismiss"]').should('be.visible');
    cy.get('[data-testid="feedback-modal-submit"]').should('be.visible');
  });

  it('calls onDismiss when Maybe later is clicked', () => {
    const onDismiss = cy.stub().as('onDismiss');
    cy.mount(<FeedbackForm onDismiss={onDismiss} />);
    cy.get('[data-testid="feedback-modal-dismiss"]').click();
    cy.get('@onDismiss').should('have.been.calledOnce');
  });

  it('shows a validation error and stays mounted when all fields are empty', () => {
    cy.mount(<FeedbackForm onDismiss={cy.stub()} />);
    cy.get('[data-testid="feedback-modal-submit"]').click();
    cy.contains('Please fill in at least one field.').should('be.visible');
    // Form is still present (no success transition).
    cy.get('[data-testid="feedback-doing-well"]').should('be.visible');
  });

  it('POSTs to /api/v1/feedback, dispatches FEEDBACK_SUBMITTED_EVENT, then dismisses', () => {
    cy.intercept('POST', '/api/v1/feedback', { statusCode: 204 }).as('post');
    const onDismiss = cy.stub().as('onDismiss');
    cy.mount(<FeedbackForm onDismiss={onDismiss} />);

    let submittedFired = false;
    cy.window().then((win) => {
      win.addEventListener(FEEDBACK_SUBMITTED_EVENT, () => {
        submittedFired = true;
      });
    });

    cy.get('[data-testid="feedback-doing-well"]').type('useful chart!');
    cy.get('[data-testid="feedback-modal-submit"]').click();
    cy.wait('@post');
    cy.contains('Thanks for your feedback!').should('be.visible');
    cy.then(() => expect(submittedFired).to.be.true);
    // Success-hold is 2s; onDismiss fires after.
    cy.get('@onDismiss', { timeout: 3000 }).should('have.been.calledOnce');
  });

  it('surfaces a 429 as a user-readable error', () => {
    cy.intercept('POST', '/api/v1/feedback', { statusCode: 429 }).as('post');
    cy.mount(<FeedbackForm onDismiss={cy.stub()} />);
    cy.get('[data-testid="feedback-doing-well"]').type('hi');
    cy.get('[data-testid="feedback-modal-submit"]').click();
    cy.wait('@post');
    cy.contains('Too many submissions').should('be.visible');
  });
});
