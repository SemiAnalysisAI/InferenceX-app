import { describe, expect, it } from 'bun:test';

import { passFailed, stallWatchdogEnabled } from './unit-test-runner';

describe('stallWatchdogEnabled', () => {
  it('watches ordinary runs, including filtered and coverage runs', () => {
    expect(stallWatchdogEnabled([], {})).toBe(true);
    expect(stallWatchdogEnabled(['--coverage', '--bail=1'], {})).toBe(true);
  });

  it.each([
    '--inspect',
    '--inspect=127.0.0.1:6499',
    '--inspect-brk',
    '--inspect-brk=6499',
    '--inspect-wait',
    '--watch',
  ])('leaves a %s session alone, since it idles on purpose', (flag) => {
    expect(stallWatchdogEnabled(['--coverage', flag], {})).toBe(false);
  });

  it('leaves a session alone when an editor attaches a debugger through BUN_INSPECT', () => {
    expect(stallWatchdogEnabled([], { BUN_INSPECT: 'ws://localhost:6499/debug' })).toBe(false);
    expect(stallWatchdogEnabled([], { BUN_INSPECT: '' })).toBe(true);
  });

  it('does not mistake look-alike flags for debugging', () => {
    expect(stallWatchdogEnabled(['--watchAll', '--inspector'], {})).toBe(true);
  });
});

describe('passFailed', () => {
  it('fails a stopped pass even when bun test exits 0 on SIGTERM', () => {
    expect(passFailed(0, true)).toBe(true);
    expect(passFailed(null, true)).toBe(true);
  });

  it('follows the exit code of a pass the watchdog left alone', () => {
    expect(passFailed(0, false)).toBe(false);
    expect(passFailed(1, false)).toBe(true);
    expect(passFailed(null, false)).toBe(true);
  });
});
