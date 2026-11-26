import type { Model } from '@/lib/catalog/data-mappings';
import type { DashboardRouteKey } from '@/lib/routing/dashboard-routes';
import { modelRouteAvailableForTab } from '@/lib/routing/model-routes';

/**
 * Selections carried between the inference chart and the profit estimators when the reader
 * switches tabs. Each tab mounts its own filter provider, so without this a tab switch rebuilds
 * the destination from its route defaults.
 *
 * Inference is the source of truth: leaving it hands its model, precision, run date and
 * hardware to the profit estimator. The profit estimator may correct its model or precision to
 * one with agentic data, so leaving it hands back only what the reader picked there.
 *
 * This is client-only navigation state. It survives provider remounts and resets on a full page
 * load, like `inference-navigation-state.ts`.
 */
export type SelectionTabKind = 'inference' | 'profit';

export interface ProfitHardwareSeed {
  model: string;
  keys: string[];
}

interface ProfitPicks {
  g_model?: string;
  i_prec?: string;
  /** '' when the reader reset the legend to every chip. */
  i_active?: string;
}

let snapshots: Partial<Record<SelectionTabKind, string>> = {};
let profitPicks: ProfitPicks = {};
let profitHardwareSeed: ProfitHardwareSeed | null = null;

export function selectionTabKind(tab: DashboardRouteKey): SelectionTabKind | null {
  if (tab === 'inference') return 'inference';
  if (tab === 'profit-estimator' || tab === 'profit-estimator-per-gigawatt') return 'profit';
  return null;
}

/** The hardware the next profit estimator mount shows, when it renders `model`. */
export function getProfitHardwareSeed(): ProfitHardwareSeed | null {
  return profitHardwareSeed;
}

export function setProfitHardwareSeed(seed: ProfitHardwareSeed | null): void {
  profitHardwareSeed = seed && seed.keys.length > 0 ? seed : null;
}

/** Records a reader's pick on the profit estimator so inference applies it on return. */
export function recordProfitPick(key: keyof ProfitPicks, value: string): void {
  // Hardware picked for another model means nothing for the new one.
  if (key === 'g_model') delete profitPicks.i_active;
  profitPicks[key] = value;
}

export function resetCrossTabSelection(): void {
  snapshots = {};
  profitPicks = {};
  profitHardwareSeed = null;
}

const INFERENCE_SHARED_TO_PROFIT = ['i_prec', 'g_rundate'] as const;

/**
 * The params the destination tab opens with. `live` is the source tab's current share state with
 * `g_model` set. Records the source snapshot, and the hardware the profit estimator seeds from.
 */
export function crossTabParams(
  from: SelectionTabKind,
  to: SelectionTabKind,
  live: URLSearchParams,
): URLSearchParams {
  snapshots[from] = live.toString();

  if (from === 'profit' && to === 'profit') return new URLSearchParams(live);

  const next = new URLSearchParams(snapshots[to] ?? '');
  for (const [key, value] of live) {
    if (/^unofficialruns?$/iu.test(key)) next.set('unofficialruns', value);
  }

  if (from === 'inference') {
    const model = live.get('g_model');
    if (model && modelRouteAvailableForTab('profit-estimator', model as Model)) {
      next.set('g_model', model);
    }
    for (const key of INFERENCE_SHARED_TO_PROFIT) {
      const value = live.get(key);
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // Run ids belong to one scenario's run, so a fixed-sequence run means nothing here.
    next.delete('g_runid');
    const active = live.get('i_active')?.split(',').filter(Boolean) ?? [];
    setProfitHardwareSeed(model && active.length > 0 ? { model, keys: active } : null);
    profitPicks = {};
    return next;
  }

  if (!next.has('g_model')) {
    const model = live.get('g_model');
    if (model) next.set('g_model', model);
  }
  if (profitPicks.g_model !== undefined && profitPicks.g_model !== next.get('g_model')) {
    next.set('g_model', profitPicks.g_model);
    next.delete('i_active');
  }
  if (profitPicks.i_prec !== undefined) next.set('i_prec', profitPicks.i_prec);
  if (profitPicks.i_active !== undefined) {
    if (profitPicks.i_active) next.set('i_active', profitPicks.i_active);
    else next.delete('i_active');
    // An explicit hardware list would otherwise be replaced by the best-per-SKU set.
    next.delete('i_best');
  }
  profitPicks = {};
  return next;
}

/**
 * The legend the profit estimator shows for a hardware seed, or null to show its default. A seed
 * for another model, or one naming none of the legend's chips, falls back to every chip.
 */
export function seededHardwareVisibility(
  seed: ProfitHardwareSeed | null,
  model: string,
  legendHwKeys: readonly string[],
): Set<string> | null {
  if (!seed || seed.model !== model) return null;
  const wanted = new Set(seed.keys);
  const visible = legendHwKeys.filter((key) => wanted.has(key));
  return visible.length > 0 ? new Set(visible) : null;
}
