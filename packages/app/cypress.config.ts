import createBundler from '@bahmutov/cypress-esbuild-preprocessor';
import { defineConfig } from 'cypress';
import cypressSplit from 'cypress-split';
import path from 'path';

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
      // Landing reveals animate opacity/transform (see src/app/motion.css).
      // Force reduced motion so e2e clicks always land on settled elements.
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.family === 'chromium' && browser.name !== 'electron') {
          // CI has no physical GPU. Exercise the real WebGL game with ANGLE's
          // software renderer instead of accepting its unsupported-WebGL fallback.
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
      cypressSplit(on, config);
      return config;
    },
  },
  component: {
    setupNodeEvents(on, config) {
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.family === 'chromium' && browser.name !== 'electron') {
          // Component games need the same GPU-less WebGL setup as e2e.
          launchOptions.args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
        }
        return launchOptions;
      });
      cypressSplit(on, config);
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
