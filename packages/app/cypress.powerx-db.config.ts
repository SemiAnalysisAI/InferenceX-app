import createBundler from '@bahmutov/cypress-esbuild-preprocessor';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { defineConfig } from 'cypress';

export default defineConfig({
  allowCypressEnv: false,
  video: false,
  retries: 0,
  defaultCommandTimeout: 10000,
  screenshotsFolder: path.join(process.env.POWERX_ACCEPTANCE_OUTPUT!, 'screenshots'),
  e2e: {
    baseUrl: process.env.POWERX_ACCEPTANCE_BASE_URL ?? 'http://127.0.0.1:3137',
    specPattern: 'cypress/powerx-db/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    setupNodeEvents(on) {
      on(
        'file:preprocessor',
        createBundler({
          define: { 'process.env.NODE_ENV': '"test"' },
          alias: { '@': path.resolve(__dirname, 'src') },
        }),
      );
      on('task', {
        unlinkRetainedPoint() {
          execFileSync('bun', ['scripts/powerx-db-fixture.ts', 'unlink-retained-point'], {
            env: process.env,
          });
          return null;
        },
        retainedTelemetry(repaired: boolean) {
          return JSON.parse(
            execFileSync(
              'bun',
              ['scripts/powerx-db-fixture.ts', repaired ? 'retained-repair' : 'retained-reset'],
              { encoding: 'utf8', env: process.env },
            ),
          );
        },
        repairTelemetry() {
          return execFileSync('bun', ['scripts/powerx-db-fixture.ts', 'repair'], {
            encoding: 'utf8',
            env: process.env,
          });
        },
        setTelemetryAvailable(available: boolean) {
          execFileSync(
            'bun',
            ['scripts/powerx-db-fixture.ts', available ? 'restore' : 'unavailable'],
            { env: process.env },
          );
          return null;
        },
      });
    },
  },
});
