import createBundler from '@bahmutov/cypress-esbuild-preprocessor';
import { defineConfig } from 'cypress';
import path from 'path';
import { setupTimingSplit } from './cypress/plugins/timings';
import { DEPLOYMENT_FLAG_NAMES } from './src/lib/config/deployment-flags';

export default defineConfig({
  allowCypressEnv: false,
  experimentalMemoryManagement: true,
  numTestsKeptInMemory: 0,
  video: false,
  viewportWidth: 1280,
  viewportHeight: 720,
  retries: {
    runMode: 2,
    openMode: 0,
  },
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
          define: {
            'process.env.NODE_ENV': '"test"',
            ...Object.fromEntries(
              DEPLOYMENT_FLAG_NAMES.map((name) => [
                `process.env.${name}`,
                JSON.stringify(process.env[name] ?? ''),
              ]),
            ),
          },
          alias: { '@': path.resolve(__dirname, 'src') },
        }),
      );
      setupTimingSplit(on, config);
      return config;
    },
  },
  component: {
    setupNodeEvents(on, config) {
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
