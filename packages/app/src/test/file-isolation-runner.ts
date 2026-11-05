import 'next/dist/server/node-environment-baseline.js';

import { vi } from 'vitest';
import { builtinEnvironments } from 'vitest/environments';
import { VitestTestRunner } from 'vitest/runners';

interface WorkerBaseline {
  env: Map<string, string>;
  globals: Map<PropertyKey, PropertyDescriptor>;
  freshDomTeardown?: (global: typeof globalThis) => unknown;
  collectedFiles: number;
}

interface EvaluatedModuleNode {
  meta?: object;
  promise?: Promise<unknown>;
  exports?: unknown;
  evaluated: boolean;
  importers: Set<string>;
}

declare global {
  var __fileIsolationBaseline: WorkerBaseline | undefined;
  var __vitest_mocker__: {
    reset: () => void;
    evaluatedModules: { idToModuleMap: Map<string, EvaluatedModuleNode> };
  };
}

const workerOwnedEnvPrefix = 'VITEST_';

function isWorkerOwnedGlobal(key: PropertyKey): boolean {
  return key === 'console' || (typeof key === 'string' && key.startsWith('__vitest'));
}

function captureBaseline(): WorkerBaseline {
  const baseline: WorkerBaseline = { env: new Map(), globals: new Map(), collectedFiles: 0 };
  globalThis.__fileIsolationBaseline = baseline;
  for (const [key, value] of Object.entries(process.env))
    if (value !== undefined) baseline.env.set(key, value);
  for (const key of Reflect.ownKeys(globalThis)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(globalThis, key);
    if (descriptor) baseline.globals.set(key, descriptor);
  }
  return baseline;
}

function restoreEnv(baseline: WorkerBaseline): void {
  for (const key of Object.keys(process.env))
    if (!key.startsWith(workerOwnedEnvPrefix) && !baseline.env.has(key)) delete process.env[key];
  for (const [key, value] of baseline.env)
    if (!key.startsWith(workerOwnedEnvPrefix) && process.env[key] !== value)
      process.env[key] = value;
}

function restoreGlobals(baseline: WorkerBaseline): void {
  for (const key of Reflect.ownKeys(globalThis))
    if (!isWorkerOwnedGlobal(key) && !baseline.globals.has(key))
      Reflect.deleteProperty(globalThis, key);
  for (const [key, descriptor] of baseline.globals)
    if (!isWorkerOwnedGlobal(key)) Reflect.defineProperty(globalThis, key, descriptor);
}

function resetInlinedModules(): void {
  __vitest_mocker__.reset();
  for (const node of __vitest_mocker__.evaluatedModules.idToModuleMap.values()) {
    if (node.meta && 'externalize' in node.meta) continue;
    node.promise = undefined;
    node.exports = undefined;
    node.evaluated = false;
    node.importers.clear();
  }
}

async function isolateFromPreviousFile(environmentOptions: Record<string, unknown>): Promise<void> {
  const baseline = globalThis.__fileIsolationBaseline ?? captureBaseline();
  baseline.collectedFiles += 1;
  if (baseline.collectedFiles === 1) return;
  vi.useRealTimers();
  await vi.dynamicImportSettled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetInlinedModules();
  await baseline.freshDomTeardown?.(globalThis);
  baseline.freshDomTeardown = undefined;
  restoreGlobals(baseline);
  restoreEnv(baseline);
  if ('jsdom' in globalThis) {
    const freshDom = await builtinEnvironments.jsdom.setup(globalThis, environmentOptions);
    baseline.freshDomTeardown = freshDom.teardown;
  }
}

export default class FileIsolationRunner extends VitestTestRunner {
  #previousImportSource?: Parameters<VitestTestRunner['importFile']>[1];

  async importFile(...args: Parameters<VitestTestRunner['importFile']>): Promise<unknown> {
    const source = args[1];
    if (this.#previousImportSource === undefined || this.#previousImportSource === 'collect')
      await isolateFromPreviousFile(this.config.environmentOptions ?? {});
    this.#previousImportSource = source;
    return super.importFile(...args);
  }
}
