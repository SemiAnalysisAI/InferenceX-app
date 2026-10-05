import { HeistGame } from '@/components/gta/heist-game';

type GameWindow = Window & {
  advanceTime: (ms: number) => void;
  render_game_to_text: () => string;
};

describe('GTA heist controls', () => {
  it('starts, drives, pauses, resumes and resets without stale controls', () => {
    cy.mount(
      <div style={{ height: 750 }}>
        <HeistGame />
      </div>,
    );
    cy.get('[data-testid="heist-game"]').should('have.attr', 'data-phase', 'ready');
    cy.get('[data-testid="heist-start"]').click();
    cy.get('[data-testid="heist-canvas"]')
      .should('have.focus')
      .trigger('keydown', { code: 'ArrowUp' });
    cy.window().then((win) => {
      const game = win as unknown as GameWindow;
      game.advanceTime(1000);
      const state = JSON.parse(game.render_game_to_text());
      expect(state.car.y).to.be.lessThan(550);
      expect(state.car.speed).to.be.greaterThan(100);
    });
    cy.get('[data-testid="heist-canvas"]').trigger('keyup', { code: 'ArrowUp' });
    cy.get('[data-testid="heist-pause"]').click();
    cy.get('[data-testid="heist-game"]').should('have.attr', 'data-phase', 'paused');
    cy.window().then((win) => {
      const game = win as unknown as GameWindow;
      const before = game.render_game_to_text();
      game.advanceTime(5000);
      expect(game.render_game_to_text()).to.equal(before);
    });
    cy.get('[data-testid="heist-start"]').click();
    cy.get('[data-testid="heist-game"]').should('have.attr', 'data-phase', 'driving');
    cy.get('[data-testid="heist-reset"]').click();
    cy.get('[data-testid="heist-cargo"]').should('have.text', '0 / 3');
    cy.get('[data-testid="heist-speed"]').should('have.text', '000');
    cy.get('[data-testid="heist-collect"]').should('be.disabled');
  });

  it('pauses for the map and lets a selected destination resume the run', () => {
    cy.mount(
      <div style={{ height: 750 }}>
        <HeistGame />
      </div>,
    );
    cy.get('[data-testid="heist-start"]').click();
    cy.get('[data-testid="heist-map"]').click();
    cy.get('[data-testid="heist-game"]').should('have.attr', 'data-phase', 'paused');
    cy.get('[data-testid="heist-stop-nvidia"]').click();
    cy.get('[data-testid="heist-game"]').should('have.attr', 'data-phase', 'driving');
    cy.get('.heist-gps').should('contain.text', 'NVIDIA');
    cy.get('[data-testid="heist-stop-nvidia"]').should('have.attr', 'aria-pressed', 'true');
  });

  it('provides Chinese mission and control labels', () => {
    cy.mount(
      <div style={{ height: 750 }}>
        <HeistGame locale="zh" />
      </div>,
    );
    cy.get('[data-testid="heist-start"]').should('have.text', '发动引擎').click();
    cy.get('[data-testid="heist-forward"]').should('have.attr', 'aria-label', '加速');
    cy.get('[data-testid="heist-map"]').should('have.text', '路线地图');
  });

  it('rounds the countdown consistently and supports mobile destination selection', () => {
    cy.viewport(390, 844);
    cy.mount(
      <div style={{ height: 844 }}>
        <HeistGame />
      </div>,
    );
    cy.get('[data-testid="heist-start"]').click();
    cy.window().then((win) => (win as unknown as GameWindow).advanceTime(1500));
    cy.get('[data-testid="heist-timer"]').should('have.text', '4:59');
    cy.get('[data-testid="heist-map"]').click();
    cy.get('[data-testid="heist-mobile-destination"]').should('be.visible').select('amd');
    cy.get('[data-testid="heist-game"]').should('have.attr', 'data-phase', 'driving');
    cy.get('.heist-gps').should('contain.text', 'AMD');
  });
});
