import createBundler from '@bahmutov/cypress-esbuild-preprocessor';
import { defineConfig } from 'cypress';
import { readFileSync } from 'node:fs';
import path from 'path';
import { setupTimingSplit } from './cypress/plugins/timings';

/** Serves the published axe-core bundle that `checkA11y` (cypress/support/axe.ts) injects. */
function registerAxeSource(on: Cypress.PluginEvents) {
  on('task', { axeSource: () => readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8') });
}

export default defineConfig({
  numTestsKeptInMemory: 0,
  video: false,
  viewportWidth: 1280,
  viewportHeight: 720,
  defaultCommandTimeout: 6000,
  e2e: {
    testIsolation: false,
    baseUrl: 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    setupNodeEvents(on, config) {
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.family === 'chromium' && browser.name !== 'electron') {
          launchOptions.args.push(
            '--force-prefers-reduced-motion',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          );
        }
        return launchOptions;
      });
      on(
        'file:preprocessor',
        createBundler({
          define: { 'process.env.NODE_ENV': '"test"' },
          alias: { '@': path.resolve(__dirname, 'src') },
        }),
      );
      registerAxeSource(on);
      setupTimingSplit(on, config);
      return config;
    },
  },
  component: {
    setupNodeEvents(on, config) {
      registerAxeSource(on);
      setupTimingSplit(on, config);
      return config;
    },
    devServer: {
      framework: 'next',
      bundler: 'webpack',
    },
    specPattern: 'cypress/component/**/*.cy.tsx',
    supportFile: 'cypress/support/component.ts',
    screenshotOnRunFailure: false,
  },
});
