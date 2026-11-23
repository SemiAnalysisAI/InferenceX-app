/**
 * Loads the system power model (`modeled-system-power.ts` and the ported Python model behind it,
 * about 90 KB) in its own chunk, so the inference chart's first JavaScript does not carry it.
 * The browser starts the download when this module evaluates, which is before hydration, so the
 * model normally arrives while React hydrates and the benchmark rows load.
 */
import { useSyncExternalStore } from 'react';

import type { modelSystemPower } from './modeled-system-power';

export type SystemPowerModeler = typeof modelSystemPower;

let modeler: SystemPowerModeler | undefined;
let loadError: unknown;
let loading: Promise<SystemPowerModeler> | undefined;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** Starts loading the model once and resolves with it. A failed load is retried on the next call. */
export function loadSystemPowerModeler(): Promise<SystemPowerModeler> {
  loading ??= import('./modeled-system-power').then(
    (module) => {
      modeler = module.modelSystemPower;
      loadError = undefined;
      notify();
      return modeler;
    },
    (error: unknown) => {
      loading = undefined;
      loadError = error;
      notify();
      throw error;
    },
  );
  return loading;
}

if (typeof window !== 'undefined') loadSystemPowerModeler().catch(() => {});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => modeler;
const getServerSnapshot = () => undefined;

/**
 * The loaded model, or `undefined` while it loads and during server rendering. A chunk that
 * failed to load throws to the nearest error boundary, as a failed `next/dynamic` chunk does.
 */
export function useSystemPowerModeler(): SystemPowerModeler | undefined {
  const loaded = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!loaded && loadError !== undefined) throw loadError;
  return loaded;
}
