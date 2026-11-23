// Decisions scripts/test-unit.ts makes about its stall watchdog, kept pure so they are unit-tested.

// A debugger paused at a breakpoint, or watch mode waiting for an edit, leaves a pass idle on purpose.
const IDLE_FLAG = /^--(?:inspect|inspect-brk|inspect-wait|watch)(?:=|$)/u;

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
