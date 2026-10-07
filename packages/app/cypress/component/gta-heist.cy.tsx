import { GtaGame } from '@/components/gta/gta-game';

type GameWindow = Window & {
  advanceTime: (ms: number) => void;
  render_game_to_text: () => string;
};
describe('GTA 3D city', () => {
  it('preserves sightseeing GPS and explicit fast travel on the San Fierro map', () => {
    cy.mount(
      <div style={{ height: 750 }}>
        <GtaGame />
      </div>,
    );
    cy.get('[data-testid="heist-start"]', { timeout: 60000 }).should('be.visible');
    cy.window().then((win) => (win as unknown as GameWindow).advanceTime(0));
    let x: number, z: number;
    cy.window().then((win) => {
      const state = JSON.parse((win as unknown as GameWindow).render_game_to_text());
      x = state.car.x;
      z = state.car.z;
    });
    cy.contains('button', 'Explore Bay Area').click();
    cy.get('#gta-destination').select('nvidia_endeavor');
    cy.get('[data-testid="tour-drive"]').click();
    cy.window().then((win) => {
      const state = JSON.parse((win as unknown as GameWindow).render_game_to_text());
      expect(state.car.x).to.equal(x);
      expect(state.car.z).to.equal(z);
      expect(state.tour).to.equal('nvidia_endeavor');
    });
    cy.get('[data-testid="heist-timer"]').should('have.text', '∞');
    cy.get('[data-testid="heist-map"]').click();
    cy.get('[data-testid="tour-map-stop"]').should('have.length', 9);
    cy.get('[data-testid="tour-map-stop"]').eq(6).should('contain.text', 'NVIDIA HQ');
    cy.get('#gta-destination').select('sjdt');
    cy.get('[data-testid="tour-visit"]').click();
    cy.window().then((win) => {
      const state = JSON.parse((win as unknown as GameWindow).render_game_to_text());
      expect(state.car.z).to.be.greaterThan(5000);
      expect(state.tour).to.equal('sjdt');
      expect(state.cash).to.equal(0);
    });
    cy.get('[data-testid="heist-canvas"]').trigger('keydown', { code: 'KeyC' });
    cy.get('[data-testid="heist-canvas"]').trigger('keydown', { code: 'KeyC' });
    cy.window().then((win) => {
      expect(JSON.parse((win as unknown as GameWindow).render_game_to_text()).camera).to.equal(2);
    });
  });
  it('loads, drives, pauses, resumes and resets', () => {
    cy.mount(
      <div style={{ height: 750 }}>
        <GtaGame />
      </div>,
    );
    cy.get('[data-testid="heist-start"]', { timeout: 60000 }).click();
    cy.contains('button', 'Sound').click();
    cy.get('[data-testid="heist-canvas"]').should('have.focus');
    cy.contains('button', 'Mute').click();
    cy.get('[data-testid="heist-canvas"]').should('have.focus');
    cy.get('[data-testid="heist-canvas"]')
      .should('have.focus')
      .trigger('keydown', { code: 'KeyW' });
    cy.window().then((win) => {
      const game = win as unknown as GameWindow;
      const before = JSON.parse(game.render_game_to_text());
      game.advanceTime(1000);
      const state = JSON.parse(game.render_game_to_text());
      expect(Math.hypot(state.car.x - before.car.x, state.car.z - before.car.z)).to.be.greaterThan(
        3,
      );
      // The Buffalo starts at 7.5 m/s² before drag and the street's grade.
      expect(state.car.speed).to.be.within(5, 7.5);
      expect(state.district).to.be.a('string');
    });
    cy.get('[data-testid="heist-canvas"]').trigger('keyup', { code: 'KeyW' });
    cy.get('[data-testid="heist-pause"]').click();
    cy.get('[data-testid="heist-game"]').should('have.attr', 'data-phase', 'paused');
    cy.window().then((win) => {
      const game = win as unknown as GameWindow,
        before = game.render_game_to_text();
      game.advanceTime(5000);
      expect(game.render_game_to_text()).to.equal(before);
    });
    cy.get('[data-testid="heist-start"]').click();
    cy.get('[data-testid="heist-canvas"]').trigger('keydown', { code: 'Space' });
    cy.window().then((win) => (win as unknown as GameWindow).advanceTime(4000));
    cy.get('[data-testid="heist-canvas"]').trigger('keyup', { code: 'Space' });
    cy.get('[data-testid="heist-travel-south"]').click();
    cy.window().then((win) => {
      const state = JSON.parse((win as unknown as GameWindow).render_game_to_text());
      expect(state.car.z).to.be.greaterThan(4300);
    });
    cy.get('[data-testid="heist-travel-south"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="heist-travel-city"]').click();
    cy.get('[data-testid="heist-travel-city"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="heist-reset"]').click();
    cy.get('[data-testid="heist-speed"]').should('contain.text', '000');
  });
  it('has Chinese controls, map pause and on-foot mode', () => {
    cy.viewport(390, 844);
    cy.mount(
      <div style={{ height: 844 }}>
        <GtaGame locale="zh" />
      </div>,
    );
    cy.get('[data-testid="heist-start"]', { timeout: 60000 })
      .should('have.text', '发动引擎')
      .click();
    cy.get('[data-testid="heist-forward"]').should('have.attr', 'aria-label', '加速 / 前进');
    cy.get('[data-testid="heist-map"]').click();
    cy.get('[data-testid="heist-game"]').should('have.attr', 'data-phase', 'paused');
    cy.contains('button', '返回').click();
    cy.get('[data-testid="heist-start"]').click();
    cy.contains('button', '上车 / 下车').click();
    cy.get('[data-testid="heist-speed"]').should('contain.text', '步行');
  });
});
