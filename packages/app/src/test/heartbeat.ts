// Preloaded first by scripts/test-unit.ts. Every worker appends a line to the runner's heartbeat
// file when a test file starts and ends, and around each test, so a long file or --rerun-each still
// shows progress. The runner watches the file grow to tell when a pass has stopped making progress.
import { afterAll, afterEach, beforeEach } from 'bun:test';
import fs from 'node:fs';

const heartbeat = process.env.UNIT_TEST_HEARTBEAT;
if (heartbeat) {
  // Captured before the test file loads, so a mock of node:fs cannot replace it.
  const append = fs.appendFileSync;
  const beat = () => append(heartbeat, '\n');
  beat();
  beforeEach(beat);
  afterEach(beat);
  afterAll(beat);
}
