/**
 * Loads the system power model (`modeled-system-power.ts` and the ported Python model behind it,
 * about 90 KB) in its own chunk, so the inference chart's first JavaScript does not carry it.
 * The browser starts the download when this module evaluates, which is before hydration, so the
 * model normally arrives while React hydrates and the benchmark rows load.
 */
import { useSyncExternalStore } from 'react';

import type { modelSystemPower } from './modeled-system-power';

export type SystemPowerModeler = typeof modelSystemPower;

type ModelerState =
  | { status: 'idle' | 'loading' }
  | { status: 'loaded'; modeler: SystemPowerModeler }
  | { status: 'failed'; error: unknown };

const IDLE: ModelerState = { status: 'idle' };
const LOADING: ModelerState = { status: 'loading' };

export interface SystemPowerModelerStore {
  /** Starts a load unless one is running or done, and resolves with the model. */
  load: () => Promise<SystemPowerModeler>;
  /**
   * The loaded model, or `undefined` while it loads and during server rendering. A failed load
   * throws to the nearest error boundary, as a failed `next/dynamic` chunk does, and starts a
   * fresh load, so the boundary's retry or a later mount gets the model once it arrives.
   */
  useModeler: () => SystemPowerModeler | undefined;
}

/** A store around one chunk loader. Tests pass a loader they control. */
export function createSystemPowerModelerStore(
  importModeler: () => Promise<SystemPowerModeler>,
): SystemPowerModelerStore {
  let state = IDLE;
  let pending: Promise<SystemPowerModeler> | undefined;
  const listeners = new Set<() => void>();
  const setState = (next: ModelerState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const load = (): Promise<SystemPowerModeler> => {
    if (state.status === 'loaded') return Promise.resolve(state.modeler);
    if (pending) return pending;
    setState(LOADING);
    pending = importModeler().then(
      (modeler) => {
        pending = undefined;
        setState({ status: 'loaded', modeler });
        return modeler;
      },
      (error: unknown) => {
        pending = undefined;
        // A new state object, so every subscribed chart re-renders and throws it.
        setState({ status: 'failed', error });
        throw error;
      },
    );
    return pending;
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const getSnapshot = () => state;
  const getServerSnapshot = () => IDLE;

  const useModeler = () => {
    const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    if (current.status === 'failed') {
      // Retry once React has committed the error boundary. A load started during render would
      // replace the snapshot React is still checking.
      queueMicrotask(() => {
        if (state === current) load().catch(() => {});
      });
      throw current.error;
    }
    return current.status === 'loaded' ? current.modeler : undefined;
  };

  return { load, useModeler };
}

const store = createSystemPowerModelerStore(() =>
  import('./modeled-system-power').then((module) => module.modelSystemPower),
);

export const loadSystemPowerModeler = store.load;
export const useSystemPowerModeler = store.useModeler;

if (typeof window !== 'undefined') loadSystemPowerModeler().catch(() => {});
