// Preloaded first by scripts/test-unit.ts. Every worker appends a line to the runner's heartbeat
// file when a test file starts and when it ends; the runner watches the file's modification time to
// tell when a pass has stopped making progress.
import { afterAll } from 'bun:test';
import fs from 'node:fs';

const heartbeat = process.env.UNIT_TEST_HEARTBEAT;
if (heartbeat) {
  // Captured before the test file loads, so a mock of node:fs cannot replace it.
  const append = fs.appendFileSync;
  append(heartbeat, '\n');
  afterAll(() => append(heartbeat, '\n'));
}
