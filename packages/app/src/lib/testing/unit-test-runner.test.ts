import { describe, expect, it } from 'bun:test';

import {
  leakedRequireHooks,
  passFailed,
  stallClock,
  stallWatchdogEnabled,
} from './unit-test-runner';

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
    // Type-checks every file before the first test, so no heartbeat comes for a while.
    '--check',
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

describe('stallClock', () => {
  it('stalls only once the heartbeat has not grown for the whole limit', () => {
    const stalled = stallClock(60_000, 1_000);
    expect(stalled(0, 60_999)).toBe(false);
    expect(stalled(0, 61_000)).toBe(true);
  });

  it('restarts the limit on the runner clock whenever the heartbeat grows', () => {
    const stalled = stallClock(60_000, 0);
    expect(stalled(10, 50_000)).toBe(false);
    expect(stalled(20, 100_000)).toBe(false);
    expect(stalled(20, 159_999)).toBe(false);
    expect(stalled(20, 160_000)).toBe(true);
  });

  it('counts an unreadable heartbeat as no progress', () => {
    const stalled = stallClock(60_000, 0);
    expect(stalled(5, 1_000)).toBe(false);
    expect(stalled(null, 30_000)).toBe(false);
    expect(stalled(null, 61_000)).toBe(true);
  });
});

const native = () => {};
const tsx = () => {};
const hook = (value: unknown, enumerable = true): PropertyDescriptor => ({
  value,
  enumerable,
  writable: true,
  configurable: true,
});

describe('leakedRequireHooks', () => {
  const before = { '.js': hook(native), '.json': hook(native) };

  it('finds nothing when every hook is unchanged', () => {
    expect(leakedRequireHooks(before, { ...before })).toEqual([]);
  });

  it('finds a replaced hook', () => {
    expect(leakedRequireHooks(before, { ...before, '.js': hook(() => {}) })).toEqual(['.js']);
  });

  it('finds added hooks, including non-enumerable ones that Object.keys misses', () => {
    const after = { ...before, '.tsx': hook(tsx), '.mjs': hook(tsx, false) };
    expect(leakedRequireHooks(before, after)).toEqual(['.tsx', '.mjs']);
  });

  it('catches a non-enumerable hook defined on a live extensions object', () => {
    const extensions: Record<string, unknown> = { '.js': native };
    const snapshot = Object.getOwnPropertyDescriptors(extensions);
    Object.defineProperty(extensions, '.mjs', { value: () => {}, configurable: true });
    expect(Object.keys(extensions)).toEqual(['.js']);
    expect(leakedRequireHooks(snapshot, Object.getOwnPropertyDescriptors(extensions))).toEqual([
      '.mjs',
    ]);
  });

  it('finds a hook whose function is kept but whose descriptor changed', () => {
    expect(leakedRequireHooks(before, { ...before, '.json': hook(native, false) })).toEqual([
      '.json',
    ]);
  });

  it('finds a deleted hook', () => {
    expect(leakedRequireHooks(before, { '.js': before['.js'] })).toEqual(['.json']);
  });
});
