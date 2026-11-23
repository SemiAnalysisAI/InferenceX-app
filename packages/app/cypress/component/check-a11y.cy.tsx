import { checkA11y } from '../support/axe';

// The accessibility specs only prove anything if checkA11y fails on real violations.
const BROKEN = (
  <div data-testid="broken">
    <button type="button" />
    <img src="data:," />
  </div>
);

describe('checkA11y', () => {
  it('fails with the violation count and logs each violation', (done) => {
    const logged: string[] = [];
    cy.on('log:added', (log) => {
      if (log.name === 'a11y error!') logged.push(String(log.message));
    });
    cy.on('fail', (error) => {
      expect(error.message).to.contain('2 accessibility violations were detected');
      expect(logged).to.deep.equal(['button-name on 1 Node', 'image-alt on 1 Node']);
      done();
      return false;
    });
    cy.mount(BROKEN);
    checkA11y('[data-testid="broken"]');
  });

  it('lets a violation callback report instead', (done) => {
    cy.on('fail', (error) => {
      expect(error.message).to.equal('custom: button-name,image-alt');
      done();
      return false;
    });
    cy.mount(BROKEN);
    checkA11y('[data-testid="broken"]', {}, (violations) => {
      throw new Error(`custom: ${violations.map(({ id }) => id).join(',')}`);
    });
  });

  it('audits only the rules runOnly selects', () => {
    cy.mount(BROKEN);
    checkA11y('[data-testid="broken"]', { runOnly: { type: 'rule', values: ['color-contrast'] } });
  });

  it('passes accessible content', () => {
    cy.mount(
      <div data-testid="fine">
        <button type="button">Save</button>
      </div>,
    );
    checkA11y('[data-testid="fine"]');
  });
});
