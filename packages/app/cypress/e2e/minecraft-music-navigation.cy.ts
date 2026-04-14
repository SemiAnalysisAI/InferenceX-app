describe('Minecraft music navigation', () => {
  it('keeps the music player mounted across same-site header navigation', () => {
    let documentLoads = 0;

    cy.intercept('GET', 'https://www.youtube.com/iframe_api', {
      statusCode: 200,
      body: '',
    });

    cy.on('window:before:load', (win) => {
      documentLoads++;
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      win.localStorage.setItem('theme', 'minecraft');
      win.localStorage.setItem('minecraft-music', 'true');

      interface PlayerConfig {
        videoId?: string;
        playerVars?: Record<string, string | number>;
        events?: {
          onReady?: (event: { target: FakePlayer }) => void;
          onStateChange?: (event: { target: FakePlayer; data: number }) => void;
        };
      }

      type MinecraftTestWindow = Window & {
        __minecraftPlayerCreates: number;
        __minecraftPlayerDestroys: number;
        __minecraftPlayerConfig?: PlayerConfig;
      };

      class FakePlayer {
        private readonly config: PlayerConfig;

        constructor(_el: HTMLElement, config: PlayerConfig) {
          const testWin = win as unknown as MinecraftTestWindow;
          testWin.__minecraftPlayerCreates++;
          testWin.__minecraftPlayerConfig = config;
          this.config = config;
          setTimeout(() => config.events?.onReady?.({ target: this }), 0);
        }

        setVolume() {
          return undefined;
        }

        getCurrentTime() {
          return 12;
        }

        seekTo() {
          return undefined;
        }

        playVideo() {
          this.config.events?.onStateChange?.({ target: this, data: 1 });
        }

        destroy() {
          (win as unknown as MinecraftTestWindow).__minecraftPlayerDestroys++;
        }
      }

      const testWin = win as unknown as MinecraftTestWindow;
      testWin.__minecraftPlayerCreates = 0;
      testWin.__minecraftPlayerDestroys = 0;
      (testWin as MinecraftTestWindow & { YT: { Player: typeof FakePlayer } }).YT = {
        Player: FakePlayer,
      };
    });

    cy.visit('/');
    cy.get('html').should('have.class', 'minecraft');
    cy.window().its('__minecraftPlayerCreates').should('eq', 1);
    cy.window().then((win) => {
      const config = (win as any).__minecraftPlayerConfig;
      expect(config.videoId).to.eq('bIOiV4d1SVI');
      expect(config.playerVars.playlist).to.eq('bIOiV4d1SVI');
      expect(config.playerVars.list).to.eq(undefined);
      expect(config.playerVars.listType).to.eq(undefined);
      expect([0, 207, 370, 572, 817, 1099, 1146, 1233, 1418, 1631]).to.include(
        config.playerVars.start,
      );
    });

    cy.get('[data-testid="nav-link-blog"]').click();
    cy.location('pathname').should('eq', '/blog');
    cy.window().then((win) => {
      expect(documentLoads).to.eq(1);
      expect((win as any).__minecraftPlayerCreates).to.eq(1);
      expect((win as any).__minecraftPlayerDestroys).to.eq(0);
    });

    cy.get('[data-testid="nav-link-home"]').click();
    cy.location('pathname').should('eq', '/');
    cy.window().then((win) => {
      expect(documentLoads).to.eq(1);
      expect((win as any).__minecraftPlayerCreates).to.eq(1);
      expect((win as any).__minecraftPlayerDestroys).to.eq(0);
    });
  });
});
