'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useUnofficialRun } from '@/providers/unofficial-run-provider';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useUrlState } from '@/hooks/useUrlState';
import { track } from '@/lib/analytics/analytics';
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
import PowerFitPanel from './PowerFitPanel';
import PowerRoleGroup from './PowerRoleGroup';

const STRINGS = {
  en: {
    roles: 'Prefill / decode roles',
    fit: 'Power vs output-rate fit',
    breakdown: 'System power breakdown',
    drillTitle: (chip: string) => `${chip} across load`,
    drillSubtitle:
      'Every benchmark point of this chip, split the same way. Lower interactivity means more concurrent users.',
    fitSummary: 'How power scales with output rate',
    fitHint: 'A straight-line fit per config: idle-ish floor plus joules per extra output token.',
  },
  zh: {
    roles: '预填充 / 解码角色',
    fit: '功耗与输出速率拟合',
    breakdown: '系统功耗构成',
    drillTitle: (name: string) => `${name} 随负载的变化`,
    drillSubtitle: '该芯片的每个基准测试点按相同方式拆分。交互性越低，并发用户越多。',
    fitSummary: '功耗如何随输出速率变化',
    fitHint: '按配置做直线拟合：近似空载功耗，加上每多输出一个 Token 的焦耳数。',
  },
};

function PanelToggle({
  checked,
  onChange,
  label,
  testId,
  event,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  testId: string;
  event: string;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
          track(event, { enabled: e.target.checked });
        }}
        data-testid={testId}
      />
      {label}
    </label>
  );
}

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
  initialBreakdown = false,
  layout = 'toggles',
  showRoles = false,
  placement = 'after',
}: {
  data: InferenceData[];
  overlayData?: readonly InferenceData[];
  xField: keyof AggDataEntry;
  xLabel: string;
  chartId: string;
  contextLabel?: string;
  /** Open the system breakdown when the URL does not say otherwise. */
  initialBreakdown?: boolean;
  /**
   * `toggles`: the checkbox row used inside Inference Performance.
   * `where` / `draw`: the PowerX tab, where each question owns its sections.
   */
  layout?: 'toggles' | 'where' | 'draw';
  /** PowerX tab: show the prefill/decode panel (driven by the Split by toggle). */
  showRoles?: boolean;
  /**
   * `before`: the PowerX Where tab leads with the chip comparison (the answer),
   * and the boundary line chart follows as supporting detail.
   */
  placement?: 'before' | 'after';
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { getUrlParam, setUrlParams } = useUrlState();
  const { runIndexByUrl } = useUnofficialRun();
  const [roleShare, setRoleShare] = useState(() => getUrlParam('i_roleshare') === '1');
  const [powerFit, setPowerFit] = useState(() => getUrlParam('i_powerfit') === '1');
  const [powerBreakdown, setPowerBreakdown] = useState(
    () => getUrlParam('i_powerbreakdown') === '1' || initialBreakdown,
  );
  const sources = useMemo(() => getEqualServiceSources(data, locale), [data, locale]);
  useEffect(() => {
    setUrlParams({
      i_roleshare: roleShare ? '1' : '0',
      i_powerfit: powerFit ? '1' : '0',
      i_powerbreakdown: powerBreakdown ? '1' : '0',
    });
  }, [roleShare, powerFit, powerBreakdown, setUrlParams]);
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
  const breakdownSeries = useMemo(
    () =>
      layout === 'where'
        ? buildPowerBreakdowns(data, locale, powerBreakdownInteractivity(xField))
        : [],
    [layout, data, locale, xField],
  );
  // The drill-down follows the chip picked in the comparison, else its first chip.
  const drillSeries =
    breakdownSeries.find((entry) => entry.key === compareKey) ?? breakdownSeries[0] ?? null;
  const breakdownSeriesLabel = drillSeries?.label ?? null;

  if (layout === 'draw') {
    return (
      <details className="group mt-6 min-w-0 border-t pt-4" data-testid="power-analysis-panels">
        <summary className="cursor-pointer select-none">
          <span className="text-sm font-medium">{t.fitSummary}</span>
          <span className="ml-2 text-xs text-muted-foreground">{t.fitHint}</span>
        </summary>
        <div className="mt-3">
          <PowerFitPanel
            chartId={chartId}
            data={data}
            contextLabel={contextLabel}
            colorOf={colorOf}
          />
        </div>
      </details>
    );
  }

  if (layout === 'where') {
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

  return (
    <div className="mt-6 min-w-0 space-y-4 border-t pt-4" data-testid="power-analysis-panels">
      <div className="no-export flex flex-wrap gap-4 text-sm">
        <PanelToggle
          checked={roleShare}
          onChange={setRoleShare}
          label={t.roles}
          testId="role-share-toggle"
          event="inference_power_roles_toggled"
        />
        <PanelToggle
          checked={powerFit}
          onChange={setPowerFit}
          label={t.fit}
          testId="power-fit-toggle"
          event="inference_power_fit_toggled"
        />
        <PanelToggle
          checked={powerBreakdown}
          onChange={setPowerBreakdown}
          label={t.breakdown}
          testId="power-breakdown-toggle"
          event="inference_power_breakdown_toggled"
        />
      </div>
      {roleShare && (
        <PowerRoleGroup
          chartId={chartId}
          data={data}
          xField={xField}
          xLabel={xLabel}
          contextLabel={contextLabel}
          sources={sources}
          colorOf={colorOf}
        />
      )}
      {powerFit && (
        <PowerFitPanel
          chartId={chartId}
          data={data}
          contextLabel={contextLabel}
          colorOf={colorOf}
        />
      )}
      {powerBreakdown && (
        <PowerBreakdownPanel
          chartId={chartId}
          data={data}
          contextLabel={contextLabel}
          xField={xField}
          xLabel={xLabel}
        />
      )}
    </div>
  );
}
