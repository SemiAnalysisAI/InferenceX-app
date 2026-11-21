// Test helpers bun:test does not ship. Each test file runs on a fresh global object, so stubs
// cannot leak across files; restore them in afterEach when tests in one file must not share them.
import timers from 'node:timers';

import {
  install,
  timers as fakeableTimers,
  type Clock,
  type FakeMethod,
} from '@sinonjs/fake-timers';
import type { Mock } from 'bun:test';

const stubbedGlobals = new Map<PropertyKey, PropertyDescriptor | undefined>();

export function stubGlobal(key: string, value: unknown): void {
  if (!stubbedGlobals.has(key))
    stubbedGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

export function unstubAllGlobals(): void {
  for (const [key, descriptor] of stubbedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  stubbedGlobals.clear();
}

const stubbedEnv = new Map<string, string | undefined>();

export function stubEnv(key: string, value: string | undefined): void {
  if (!stubbedEnv.has(key)) stubbedEnv.set(key, process.env[key]);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

export function unstubAllEnvs(): void {
  for (const [key, value] of stubbedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  stubbedEnv.clear();
}

export function mocked<T>(
  value: T,
): T extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : T {
  return value as never;
}

// Captured before any test fakes timers, so waitFor polls in real time like Vitest's.
const realSetTimeout = globalThis.setTimeout;
const realNow = performance.now.bind(performance);

export async function waitFor<T>(
  callback: () => T | Promise<T>,
  { timeout = 1000, interval = 50 }: { timeout?: number; interval?: number } = {},
): Promise<T> {
  const deadline = realNow() + timeout;
  for (;;) {
    try {
      return await callback();
    } catch (error) {
      if (realNow() >= deadline) throw error;
      const { promise, resolve } = Promise.withResolvers<void>();
      realSetTimeout(resolve, interval);
      await promise;
    }
  }
}

// Fake timers come from @sinonjs/fake-timers, the clock Vitest uses, so timer semantics match the
// suite's Vitest history. Like Vitest, every timer API is faked except nextTick and queueMicrotask.
let clock: Clock | undefined;

// In Bun, node:timers' exports follow the current globals, so faking globalThis.setImmediate also
// fakes require('timers').setImmediate. React's async act() schedules on the latter and would never
// resume. Node keeps node:timers real while the globals are faked; pin the real exports to match.
const realNodeTimers = { ...timers };

function installedClock(): Clock {
  if (!clock) throw new Error('Call useFakeTimers() first');
  return clock;
}

export function useFakeTimers(options: { toFake?: FakeMethod[]; now?: number | Date } = {}): void {
  clock?.uninstall();
  clock = install({
    now: options.now ?? Date.now(),
    toFake:
      options.toFake ??
      (Object.keys(fakeableTimers) as FakeMethod[]).filter(
        (name) => name !== 'nextTick' && name !== 'queueMicrotask',
      ),
  });
  for (const [key, value] of Object.entries(realNodeTimers))
    Object.defineProperty(timers, key, {
      value,
      configurable: true,
      writable: true,
      enumerable: true,
    });
}

export function useRealTimers(): void {
  clock?.uninstall();
  clock = undefined;
}

export function setSystemTime(time: number | Date): void {
  if (!clock) useFakeTimers({ toFake: ['Date'] });
  installedClock().setSystemTime(time);
}

export function getTimerCount(): number {
  return installedClock().countTimers();
}

export function advanceTimersByTime(ms: number): void {
  installedClock().tick(ms);
}

export async function advanceTimersByTimeAsync(ms: number): Promise<void> {
  await installedClock().tickAsync(ms);
}

export function advanceTimersToNextTimer(): void {
  installedClock().next();
}

export function runAllTimers(): void {
  installedClock().runAll();
}

export async function runAllTimersAsync(): Promise<void> {
  await installedClock().runAllAsync();
}

export function runOnlyPendingTimers(): void {
  installedClock().runToLast();
}

export async function runOnlyPendingTimersAsync(): Promise<void> {
  await installedClock().runToLastAsync();
}
