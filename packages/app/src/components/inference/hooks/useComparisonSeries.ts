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
import { getModelSortIndex } from '@/lib/catalog/constants';
import {
  generateGpuDateColors,
  generateHighContrastGpuDateColors,
} from '@/lib/charts/dynamic-colors';
import { isDarkTheme } from '@/lib/themes/themes';

export interface ComparisonSeries {
  date: string;
  hwKey: string;
  id: string;
  color: string;
}

export function useComparisonSeries(providedRunNumbering?: Map<string, number>) {
  const { selectedGPUs, selectedDateRange, selectedDates } = useInferenceFilters();
  const { highContrast } = useInferenceDisplay();
  const { resolvedTheme } = useTheme();

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

  const { resolveColor, getCssColor } = useThemeColors({
    highContrast,
    identifiers: graphIdentifiers,
    hcKeys: gpuDatePairs.sortedGPUs,
  });

  const gpuDateColorMap = useMemo(() => {
    const { dates, sortedGPUs } = gpuDatePairs;
    if (sortedGPUs.length === 0 || dates.length === 0) return {};
    const theme = isDarkTheme(resolvedTheme) ? 'dark' : 'light';
    return generateGpuDateColors(sortedGPUs, dates.length, theme);
  }, [gpuDatePairs, resolvedTheme]);

  const hcGpuDateColorMap = useMemo(() => {
    const { dates, sortedGPUs } = gpuDatePairs;
    if (!highContrast || sortedGPUs.length === 0 || dates.length === 0) return {};
    const theme = isDarkTheme(resolvedTheme) ? 'dark' : 'light';
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
