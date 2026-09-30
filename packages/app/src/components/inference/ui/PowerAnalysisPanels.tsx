'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useUrlState } from '@/hooks/useUrlState';
import { track } from '@/lib/analytics';
import { overlayRunColor, overlayRunIndex } from '@/lib/overlay-run-style';
import { useLocale } from '@/lib/use-locale';
import type { AggDataEntry, InferenceData } from '../types';
import {
  equalServiceSourceKey,
  getEqualServiceSources,
  observedPoints,
} from '../utils/equal-service-comparison';
import PowerFitPanel from './PowerFitPanel';
import PowerRoleGroup from './PowerRoleGroup';

const STRINGS = {
  en: {
    roles: 'Prefill / decode roles',
    fit: 'Power vs output-rate fit',
  },
  zh: {
    roles: '预填充 / 解码角色',
    fit: '功耗与输出速率拟合',
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

export default function PowerAnalysisPanels({
  data,
  overlayData = [],
  xField,
  xLabel,
  chartId,
  contextLabel,
}: {
  data: InferenceData[];
  overlayData?: readonly InferenceData[];
  xField: keyof AggDataEntry;
  xLabel: string;
  chartId: string;
  contextLabel?: string;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { getUrlParam, setUrlParams } = useUrlState();
  const { runIndexByUrl } = useUnofficialRun();
  const [roleShare, setRoleShare] = useState(() => getUrlParam('i_roleshare') === '1');
  const [powerFit, setPowerFit] = useState(() => getUrlParam('i_powerfit') === '1');
  const sources = useMemo(() => getEqualServiceSources(data, locale), [data, locale]);
  useEffect(() => {
    setUrlParams({
      i_roleshare: roleShare ? '1' : '0',
      i_powerfit: powerFit ? '1' : '0',
    });
  }, [roleShare, powerFit, setUrlParams]);
  const { resolveColor } = useThemeColors({
    highContrast: true,
    identifiers: sources.map((s) => s.key),
  });
  const overlaySourceKeys = useMemo(
    () => new Map(observedPoints(overlayData).map((p) => [equalServiceSourceKey(p), p.run_url])),
    [overlayData],
  );
  const colorOf = useCallback(
    (key: string) =>
      overlaySourceKeys.has(key)
        ? overlayRunColor(overlayRunIndex(overlaySourceKeys.get(key), runIndexByUrl))
        : resolveColor(key),
    [overlaySourceKeys, runIndexByUrl, resolveColor],
  );
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
    </div>
  );
}
