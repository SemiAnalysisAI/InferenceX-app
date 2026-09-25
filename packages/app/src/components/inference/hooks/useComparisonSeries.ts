'use client';

import { useMemo } from 'react';
import { useTheme } from 'next-themes';

import { useInferenceDisplay, useInferenceFilters } from '@/components/inference/InferenceContext';
import {
  buildRunNumbering,
  comparisonEntrySortValue,
  resolveComparisonEntries,
} from '@/components/inference/utils/comparisonEntry';
import { useThemeColors } from '@/hooks/useThemeColors';
import { getModelSortIndex } from '@/lib/constants';
import { generateGpuDateColors, generateHighContrastGpuDateColors } from '@/lib/dynamic-colors';

/** One (comparison entry, chip config) series of the date comparison view. */
export interface ComparisonSeries {
  date: string;
  hwKey: string;
  /** `${date}_${hwKey}`: the key of the `activeDates` toggle set. */
  id: string;
  color: string;
}

/**
 * Series, run numbers and colours of the date comparison view. GPUGraph and
 * the Power Timeline share them so one (date, chip config) pair reads the
 * same in both displays.
 */
export function useComparisonSeries(providedRunNumbering?: Map<string, number>) {
  const { selectedGPUs, selectedDateRange, selectedDates } = useInferenceFilters();
  const { highContrast } = useInferenceDisplay();
  const { resolvedTheme } = useTheme();

  // Shared date+GPU pairs. `dates` holds comparison-series entries (plain dates
  // and/or specific-run entries); a same-day range endpoint is dropped when that
  // date also has run entries (resolveComparisonEntries), then sorted earliest →
  // latest so a day's runs read #1 → #N.
  const gpuDatePairs = useMemo(() => {
    const deduplicated = resolveComparisonEntries(selectedDates, selectedDateRange);
    deduplicated.sort((a, b) => {
      const [ta, ia] = comparisonEntrySortValue(a);
      const [tb, ib] = comparisonEntrySortValue(b);
      return ta - tb || ia - ib;
    });
    const sortedGPUs = [...selectedGPUs].toSorted(
      (a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b),
    );
    return { dates: deduplicated, sortedGPUs };
  }, [selectedDateRange, selectedDates, selectedGPUs]);

  // Run numbers for legend/line labels. Prefer the stable numbering passed by
  // the parent (shared with the changelog, so labels match it and removed runs
  // leave a gap); fall back to gap-free numbering of the on-chart series.
  const runNumbering = useMemo(
    () => providedRunNumbering ?? buildRunNumbering(gpuDatePairs.dates),
    [providedRunNumbering, gpuDatePairs.dates],
  );

  const graphIdentifiers = useMemo(() => {
    const ids: string[] = [];
    gpuDatePairs.sortedGPUs.forEach((gpu) =>
      gpuDatePairs.dates.forEach((date) => ids.push(`${date}_${gpu}`)),
    );
    return ids;
  }, [gpuDatePairs]);

  // High contrast keys off the GPU (not `date_gpu`) so each hardware config
  // gets exactly one hue; the dates within a config are separated by the
  // lightness ramp built below rather than by unrelated hues.
  const { resolveColor, getCssColor } = useThemeColors({
    highContrast,
    identifiers: graphIdentifiers,
    hcKeys: gpuDatePairs.sortedGPUs,
  });

  // Dynamic GPU×date color map
  const gpuDateColorMap = useMemo(() => {
    const { dates, sortedGPUs } = gpuDatePairs;
    if (sortedGPUs.length === 0 || dates.length === 0) return {};
    const theme = resolvedTheme === 'dark' || resolvedTheme === 'minecraft' ? 'dark' : 'light';
    return generateGpuDateColors(sortedGPUs, dates.length, theme);
  }, [gpuDatePairs, resolvedTheme]);

  // High-contrast GPU×date color map: one iwanthue hue per GPU, ramped across
  // the compared dates so a config's runs stay recognisably the same color
  // while still reading oldest → newest.
  const hcGpuDateColorMap = useMemo(() => {
    const { dates, sortedGPUs } = gpuDatePairs;
    if (!highContrast || sortedGPUs.length === 0 || dates.length === 0) return {};
    const theme = resolvedTheme === 'dark' || resolvedTheme === 'minecraft' ? 'dark' : 'light';
    const baseColors: Record<string, string> = {};
    for (const gpu of sortedGPUs) baseColors[gpu] = getCssColor(resolveColor(gpu));
    return generateHighContrastGpuDateColors(baseColors, dates.length, theme);
  }, [gpuDatePairs, highContrast, resolvedTheme, resolveColor, getCssColor]);

  const allGraphs = useMemo(() => {
    const { dates, sortedGPUs } = gpuDatePairs;
    const result: ComparisonSeries[] = [];
    sortedGPUs.forEach((gpu) => {
      dates.forEach((date, dateIndex) => {
        const id = `${date}_${gpu}`;
        const compositeKey = `${dateIndex}_${gpu}`;
        const dynamicColor = gpuDateColorMap[compositeKey];
        result.push({
          date,
          hwKey: gpu,
          id,
          color: highContrast
            ? hcGpuDateColorMap[compositeKey] || getCssColor(resolveColor(gpu))
            : dynamicColor || 'var(--foreground)',
        });
      });
    });
    return result;
  }, [gpuDatePairs, gpuDateColorMap, hcGpuDateColorMap, highContrast, resolveColor, getCssColor]);

  const paletteIdentity = useMemo(
    () =>
      [
        resolvedTheme ?? 'system',
        highContrast ? 'high-contrast' : 'standard',
        ...allGraphs.map(({ id, color }) => `${id}:${color}`),
      ].join('|'),
    [resolvedTheme, highContrast, allGraphs],
  );

  return { gpuDatePairs, runNumbering, allGraphs, paletteIdentity, resolveColor, getCssColor };
}
