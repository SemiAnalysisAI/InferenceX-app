describe('component CSS harness', () => {
  it('loads Tailwind visibility and sizing utilities', () => {
    cy.mount(
      <button type="button" data-testid="css-probe" className="hidden size-11">
        probe
      </button>,
    );

    cy.get('[data-testid="css-probe"]').then(($probe) => {
      const style = getComputedStyle($probe[0]);

      expect({ display: style.display, width: style.width, height: style.height }).to.deep.equal({
        display: 'none',
        width: '44px',
        height: '44px',
      });
    });
  });
});
