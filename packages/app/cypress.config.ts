import createBundler from '@bahmutov/cypress-esbuild-preprocessor';
import { defineConfig } from 'cypress';
import path from 'path';

const isCi = process.env.CI === 'true';
const githubEventName = process.env.GITHUB_EVENT_NAME;
const githubRefName = process.env.GITHUB_REF_NAME;
const isPullRequestRun = githubEventName === 'pull_request';
const isMainBranchRun = githubRefName === 'main' || githubRefName === 'master';
const isScheduledRun = githubEventName === 'schedule';
const cypressRunModeRetries =
  isCi && !isPullRequestRun && (isMainBranchRun || isScheduledRun) ? 2 : 1;

export default defineConfig({
  allowCypressEnv: false,
  experimentalMemoryManagement: true,
  numTestsKeptInMemory: 0,
  video: false,
  viewportWidth: 1280,
  viewportHeight: 720,
  retries: {
    runMode: cypressRunModeRetries,
    openMode: 0,
  },
  defaultCommandTimeout: 6000,
  e2e: {
    testIsolation: false,
    baseUrl: 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: false,
    setupNodeEvents(on) {
      on(
        'file:preprocessor',
        createBundler({
          define: { 'process.env.NODE_ENV': '"test"' },
          alias: { '@': path.resolve(__dirname, 'src') },
        }),
      );
    },
  },
  component: {
    devServer: {
      framework: 'next',
      bundler: 'webpack',
    },
    specPattern: 'cypress/component/**/*.cy.tsx',
    supportFile: 'cypress/support/component.ts',
    screenshotOnRunFailure: false,
  },
});
