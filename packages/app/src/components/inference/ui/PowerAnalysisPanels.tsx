'use client';

import { useCallback, useMemo, useState } from 'react';

import { useUnofficialRun } from '@/providers/unofficial-run-provider';
import { useThemeColors } from '@/hooks/useThemeColors';
import { shadeOklch } from '@/lib/charts/dynamic-colors';
import { overlayRunColor, overlayRunIndex } from '@/lib/charts/overlay-run-style';
import { useLocale } from '@/lib/i18n/use-locale';
import type { AggDataEntry, InferenceData } from '../types';
import {
  equalServiceSourceKey,
  getEqualServiceSources,
  observedPoints,
} from '../utils/equal-service-comparison';
import PowerBreakdownPanel from './PowerBreakdownPanel';
import PowerChipCompare from './PowerChipCompare';
import { buildPowerBreakdowns, powerBreakdownInteractivity } from '../utils/power-breakdown';
import PowerRoleGroup from './PowerRoleGroup';

const STRINGS = {
  en: {
    drillTitle: (chip: string) => `${chip} across load`,
    drillSubtitle: 'Every point of this chip; the dashed outline marks the compared point.',
  },
  zh: {
    drillTitle: (name: string) => `${name} 随负载的变化`,
    drillSubtitle: '该芯片的每个基准测试点；虚线框标出上方对比所用的点。',
  },
};

/** Hardware key of an equal-service source key (a JSON tuple that starts with hwKey). */
function sourceHwKey(key: string): string {
  try {
    const parsed: unknown = JSON.parse(key);
    return Array.isArray(parsed) && typeof parsed[0] === 'string' ? parsed[0] : key;
  } catch {
    return key;
  }
}

export default function PowerAnalysisPanels({
  data,
  overlayData = [],
  xField,
  xLabel,
  chartId,
  contextLabel,
  showRoles = false,
  placement = 'after',
  layout = 'stacked',
}: {
  data: InferenceData[];
  overlayData?: readonly InferenceData[];
  xField: keyof AggDataEntry;
  xLabel: string;
  chartId: string;
  contextLabel?: string;
  /** PowerX tab: show the prefill/decode panel (driven by the Split by toggle). */
  showRoles?: boolean;
  /**
   * `before`: the PowerX Where tab leads with the chip comparison (the answer),
   * and the boundary line chart follows as supporting detail.
   */
  placement?: 'before' | 'after';
  /**
   * `inline` (PowerX v2): the chip comparison is the only visual; clicking a bar opens
   * that chip's drill-down under it instead of a second panel below the list.
   */
  layout?: 'stacked' | 'inline';
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { runIndexByUrl } = useUnofficialRun();
  const sources = useMemo(() => getEqualServiceSources(data, locale), [data, locale]);
  // Panels reuse the main chart's hardware colors; several configs on one GPU get shades of it.
  const sourceShade = useMemo(() => {
    const seen = new Map<string, number>();
    return new Map(
      sources.map((source) => {
        const hw = sourceHwKey(source.key);
        const index = seen.get(hw) ?? 0;
        seen.set(hw, index + 1);
        return [source.key, { hw, index }];
      }),
    );
  }, [sources]);
  const hwKeys = useMemo(
    () => [...new Set([...sourceShade.values()].map(({ hw }) => hw))],
    [sourceShade],
  );
  const { resolveColor } = useThemeColors({
    highContrast: false,
    identifiers: hwKeys,
    activeKeys: hwKeys,
  });
  const overlaySourceKeys = useMemo(
    () => new Map(observedPoints(overlayData).map((p) => [equalServiceSourceKey(p), p.run_url])),
    [overlayData],
  );
  const colorOf = useCallback(
    (key: string) =>
      overlaySourceKeys.has(key)
        ? overlayRunColor(overlayRunIndex(overlaySourceKeys.get(key), runIndexByUrl))
        : shadeOklch(
            resolveColor(sourceShade.get(key)?.hw ?? sourceHwKey(key)),
            sourceShade.get(key)?.index ?? 0,
          ),
    [overlaySourceKeys, runIndexByUrl, resolveColor, sourceShade],
  );
  const [compareKey, setCompareKey] = useState<string | null>(null);
  // Inline layout: the drill-down is open under the compared chip (the one nearest the
  // slider) from the first render and follows the slider to another chip. A clicked bar
  // or the Hardware select pins it to a chip until the slider moves on; Collapse hides it
  // for the rest of the session (clicking a bar opens it again).
  const [nearestKey, setNearestKey] = useState<string | null>(null);
  const [pinned, setPinned] = useState<{ key: string; nearest: string | null } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const expandedKey = collapsed
    ? null
    : pinned !== null && pinned.nearest === nearestKey
      ? pinned.key
      : nearestKey;
  const openDrilldown = useCallback(
    (key: string) => {
      setCompareKey(key);
      setPinned({ key, nearest: nearestKey });
      setCollapsed(false);
    },
    [nearestKey],
  );
  const breakdownSeries = useMemo(
    () => buildPowerBreakdowns(data, locale, powerBreakdownInteractivity(xField)),
    [data, locale, xField],
  );
  // The drill-down follows the chip picked in the comparison, else its first chip.
  const drillSeries =
    breakdownSeries.find((entry) => entry.key === compareKey) ?? breakdownSeries[0] ?? null;
  const breakdownSeriesLabel = drillSeries?.label ?? null;

  return (
    <div
      className={`min-w-0 space-y-8 ${
        placement === 'before' ? 'order-first mb-6 border-b pb-6' : 'mt-6 border-t pt-4'
      }`}
      data-testid="power-analysis-panels"
      data-placement={placement}
    >
      {showRoles ? (
        <PowerRoleGroup
          chartId={chartId}
          data={data}
          xField={xField}
          xLabel={xLabel}
          contextLabel={contextLabel}
          sources={sources}
          colorOf={colorOf}
        />
      ) : layout === 'inline' ? (
        <PowerChipCompare
          data={data}
          xField={xField}
          compact
          selectedKey={drillSeries?.key ?? null}
          expandedKey={expandedKey}
          onNearestKeyChange={setNearestKey}
          onSelectKey={(key) => {
            // Clicking the open bar closes it, like Collapse; any other bar opens there.
            if (key === expandedKey) {
              setCompareKey(key);
              setCollapsed(true);
            } else {
              openDrilldown(key);
            }
          }}
          renderExpanded={(key) => {
            const series = breakdownSeries.find((entry) => entry.key === key);
            return (
              <PowerBreakdownPanel
                chartId={chartId}
                data={data}
                contextLabel={contextLabel}
                xField={xField}
                xLabel={xLabel}
                selectedKey={key}
                onSelectKey={openDrilldown}
                compact
                onCollapse={() => setCollapsed(true)}
                heading={
                  series
                    ? { title: t.drillTitle(series.label), subtitle: t.drillSubtitle }
                    : undefined
                }
              />
            );
          }}
        />
      ) : (
        <>
          <PowerChipCompare
            data={data}
            xField={xField}
            selectedKey={drillSeries?.key ?? null}
            onSelectKey={setCompareKey}
          />
          <PowerBreakdownPanel
            chartId={chartId}
            data={data}
            contextLabel={contextLabel}
            xField={xField}
            xLabel={xLabel}
            selectedKey={drillSeries?.key ?? null}
            onSelectKey={setCompareKey}
            heading={
              breakdownSeriesLabel
                ? { title: t.drillTitle(breakdownSeriesLabel), subtitle: t.drillSubtitle }
                : undefined
            }
          />
        </>
      )}
    </div>
  );
}
