'use client';

import { useEffect, useMemo, useState } from 'react';

import { useUrlState } from '@/hooks/useUrlState';

import { type DisaggMode, type QuickFilters, type SpecMode } from '../utils/quickFilters';

/**
 * State + URL hydration for the quick-filter pills (vendor / framework /
 * agg-disagg / mtp-stp). Extracted from {@link InferenceProvider}; see
 * docs/state-ownership.md for the ownership rationale and the `i_*` param table.
 *
 * The four arrays are initialized **empty** rather than from the URL so the first
 * client render matches SSR (which has no query string). Reading the params in
 * the useState initializers would desync the pills' aria-pressed/disabled between
 * server and client; React does not patch hydration mismatches, so a shared link
 * would leave the pills frozen inactive/disabled even while the chart filters.
 * The URL selections are applied in a mount effect instead (below).
 */
export interface QuickFiltersState {
  /** Combined, referentially-memoized filter object for downstream data filtering. */
  quickFilters: QuickFilters;
  quickFilterVendors: string[];
  quickFilterFrameworks: string[];
  quickFilterDisagg: DisaggMode[];
  quickFilterSpec: SpecMode[];
  setQuickFilterVendors: (vendors: string[]) => void;
  setQuickFilterFrameworks: (frameworks: string[]) => void;
  setQuickFilterDisagg: (modes: DisaggMode[]) => void;
  setQuickFilterSpec: (modes: SpecMode[]) => void;
}

export function useQuickFiltersState(): QuickFiltersState {
  const { getUrlParam } = useUrlState();

  const [quickFilterVendors, setQuickFilterVendors] = useState<string[]>([]);
  const [quickFilterFrameworks, setQuickFilterFrameworks] = useState<string[]>([]);
  const [quickFilterDisagg, setQuickFilterDisagg] = useState<DisaggMode[]>([]);
  const [quickFilterSpec, setQuickFilterSpec] = useState<SpecMode[]>([]);

  useEffect(() => {
    const parse = (key: 'i_vendor' | 'i_fw' | 'i_disagg' | 'i_spec') => {
      const v = getUrlParam(key);
      return v ? v.split(',').filter(Boolean) : [];
    };
    const vendors = parse('i_vendor');
    const frameworks = parse('i_fw');
    const disagg = parse('i_disagg') as DisaggMode[];
    const spec = parse('i_spec') as SpecMode[];
    if (vendors.length > 0) setQuickFilterVendors(vendors);
    if (frameworks.length > 0) setQuickFilterFrameworks(frameworks);
    if (disagg.length > 0) setQuickFilterDisagg(disagg);
    if (spec.length > 0) setQuickFilterSpec(spec);
  }, [getUrlParam]);

  const quickFilters = useMemo<QuickFilters>(
    () => ({
      vendors: quickFilterVendors,
      frameworks: quickFilterFrameworks,
      disagg: quickFilterDisagg,
      spec: quickFilterSpec,
    }),
    [quickFilterVendors, quickFilterFrameworks, quickFilterDisagg, quickFilterSpec],
  );

  return {
    quickFilters,
    quickFilterVendors,
    quickFilterFrameworks,
    quickFilterDisagg,
    quickFilterSpec,
    setQuickFilterVendors,
    setQuickFilterFrameworks,
    setQuickFilterDisagg,
    setQuickFilterSpec,
  };
}
