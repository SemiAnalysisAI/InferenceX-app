// Decisions the unit test runner and its preloads make, kept pure so they are unit-tested.

// A debugger paused at a breakpoint, or watch mode waiting for an edit, leaves a pass idle on
// purpose. --check type-checks every file before the first test starts, which can take longer than
// the stall limit.
const IDLE_FLAG = /^--(?:inspect|inspect-brk|inspect-wait|watch|check)(?:=|$)/u;

/** Whether the runner may stop a pass that records no progress: not while a session is meant to idle. */
export function stallWatchdogEnabled(
  flags: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  // BUN_INSPECT attaches a debugger the way --inspect does, as editors launch it.
  return !env.BUN_INSPECT && !flags.some((flag) => IDLE_FLAG.test(flag));
}

/** A pass the watchdog stopped has failed, whatever exit code bun test chose on SIGTERM. */
export function passFailed(exitCode: number | null, stalled: boolean): boolean {
  return stalled || exitCode !== 0;
}

/**
 * Returns a check that reports a stall once the heartbeat file's size has not changed for
 * `stallMs`. Time comes only from the runner's clock, never the file's mtime, so a filesystem
 * whose clock differs cannot end a pass early or hold it open. `null` means the file could not be
 * read, which counts as no progress.
 */
export function stallClock(stallMs: number, start: number) {
  let lastSize = 0;
  let grewAt = start;
  return (size: number | null, now: number): boolean => {
    if (size !== null && size !== lastSize) {
      lastSize = size;
      grewAt = now;
    }
    return now - grewAt >= stallMs;
  };
}

type Descriptors = Readonly<Record<PropertyKey, PropertyDescriptor>>;

const sameDescriptor = (a: PropertyDescriptor, b: PropertyDescriptor) =>
  (['value', 'get', 'set', 'enumerable', 'writable', 'configurable'] as const).every((field) =>
    Object.is(a[field], b[field]),
  );

/**
 * The `require.extensions` keys whose hooks differ between two `Object.getOwnPropertyDescriptors`
 * snapshots: replaced, added (enumerable or not) or deleted.
 */
export function leakedRequireHooks(before: Descriptors, after: Descriptors): PropertyKey[] {
  const keys = new Set([...Reflect.ownKeys(before), ...Reflect.ownKeys(after)]);
  return [...keys].filter((key) => {
    const was = before[key];
    const is = after[key];
    return was === undefined || is === undefined || !sameDescriptor(was, is);
  });
}
