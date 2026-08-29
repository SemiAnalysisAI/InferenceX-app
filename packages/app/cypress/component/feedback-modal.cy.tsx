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
    cy.get('@onDismiss').should('have.been.calledOnce');
  });

  it('keeps engine-provided English accessible labels valid after success', () => {
    cy.intercept('POST', '/api/v1/feedback', { statusCode: 204 }).as('postAccessibleEn');
    cy.mount(
      <FeedbackForm
        onDismiss={cy.stub()}
        titleId="feedback-modal-title"
        descriptionId="feedback-modal-description"
      />,
    );

    cy.get('#feedback-modal-title').should('have.text', 'Help us improve InferenceX');
    cy.get('#feedback-modal-description').should(
      'have.text',
      "We'd love to hear what's working and what isn't.",
    );
    cy.get('[data-testid="feedback-doing-well"]').type('Clear charts');
    cy.get('[data-testid="feedback-modal-submit"]').click();
    cy.wait('@postAccessibleEn');
    cy.get('#feedback-modal-title').should('have.text', 'Thanks for your feedback!');
    cy.get('#feedback-modal-description').should('have.text', 'We read every response.');
  });

  it('surfaces a 429 as a user-readable error', () => {
    cy.intercept('POST', '/api/v1/feedback', { statusCode: 429 }).as('post');
    cy.mount(<FeedbackForm onDismiss={cy.stub()} />);
    cy.get('[data-testid="feedback-doing-well"]').type('hi');
    cy.get('[data-testid="feedback-modal-submit"]').click();
    cy.wait('@post');
    cy.contains('Too many submissions').should('be.visible');
  });

  it('renders validation, privacy, controls, and success in Chinese', () => {
    cy.viewport(1440, 900);
    cy.intercept('POST', '/api/v1/feedback', { statusCode: 204 }).as('postZh');
    cy.mount(<FeedbackForm locale="zh" onDismiss={cy.stub()} />);

    cy.contains('h2', '帮助我们改进 InferenceX').should('be.visible');
    cy.contains('您的反馈会加密保存').should('be.visible');
    cy.get('[data-testid="feedback-modal-submit"]').click();
    cy.contains('[role="alert"]', '请至少填写一项。').should('be.visible');

    cy.get('[data-testid="feedback-doing-well"]').type('图表很清晰');
    cy.get('[data-testid="feedback-modal-submit"]').click();
    cy.wait('@postZh');
    cy.contains('感谢您的反馈！').should('be.visible');
  });

  it('localizes rate-limit and server errors on Chinese routes', () => {
    cy.intercept('POST', '/api/v1/feedback', { statusCode: 429 }).as('rateLimited');
    cy.mount(<FeedbackForm locale="zh" onDismiss={cy.stub()} />);
    cy.get('[data-testid="feedback-doing-well"]').type('反馈');
    cy.get('[data-testid="feedback-modal-submit"]').click();
    cy.wait('@rateLimited');
    cy.contains('[role="alert"]', '提交次数过多，请稍后再试。').should('be.visible');
  });

  it('does not expose a raw network error on Chinese routes', () => {
    cy.intercept('POST', '/api/v1/feedback', { forceNetworkError: true }).as('networkFailure');
    cy.mount(<FeedbackForm locale="zh" onDismiss={cy.stub()} />);
    cy.get('[data-testid="feedback-doing-well"]').type('反馈');
    cy.get('[data-testid="feedback-modal-submit"]').click();
    cy.wait('@networkFailure');
    cy.contains('[role="alert"]', '出现意外错误，请重试。').should('be.visible');
    cy.contains('Failed to fetch').should('not.exist');
  });

  it('keeps the Chinese form inside a 375px viewport', () => {
    cy.viewport(375, 667);
    cy.mount(<FeedbackForm locale="zh" onDismiss={cy.stub()} />);

    cy.get('[data-testid="feedback-modal-submit"]').should('be.visible');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.lte(doc.documentElement.clientWidth);
    });
  });
});
