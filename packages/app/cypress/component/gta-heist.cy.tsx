import { GtaGame } from '@/components/gta/gta-game';
import { START } from '@/components/gta/gta-world';

type GameWindow = Window & {
  advanceTime: (ms: number) => void;
  render_game_to_text: () => string;
};
describe('GTA 3D city', () => {
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
      game.advanceTime(1000);
      const state = JSON.parse(game.render_game_to_text());
      expect(state.car.z).to.be.lessThan(START.z - 4);
      expect(state.car.speed).to.be.greaterThan(10);
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
