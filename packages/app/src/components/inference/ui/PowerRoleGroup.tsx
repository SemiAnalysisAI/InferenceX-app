'use client';

import * as d3 from 'd3';
import { useMemo } from 'react';

import { ChartButtons } from '@/components/ui/chart-buttons';
import { Heading } from '@/components/ui/heading';
import { exportToCsv } from '@/lib/csv-export';
import { useLocale } from '@/lib/use-locale';
import { escapeHtml } from '@/lib/utils';
import type { AggDataEntry, InferenceData } from '../types';
import {
  getRolePoints,
  type EqualServiceSource,
  type RolePoint,
} from '../utils/equal-service-comparison';
import { powerVariantDash } from '../utils/power-compare';
import { PowerPanelPlot, type PanelLine, type PanelMarker } from './PowerPanelPlot';

type RoleSeriesKey = 'prefill' | 'decode' | 'total';
type RolePanelId = 'power' | 'local-energy' | 'output-energy' | 'share';

const STRINGS = {
  en: {
    title: 'Prefill and decode roles',
    method:
      'Validated disaggregated observations only. Each panel names its denominator. Missing role telemetry is omitted, never drawn as zero.',
    empty: 'No validated prefill/decode telemetry is available for these filters.',
    panelEmpty: 'These observations do not report this role figure.',
    roles: { prefill: 'Prefill', decode: 'Decode', total: 'Prefill + decode' },
    panels: {
      power: {
        title: 'Mean GPU power by role',
        axis: 'Mean GPU power (W/GPU)',
        note: 'Mean board power per GPU inside each pool over the validated window.',
        units: { prefill: 'W/GPU', decode: 'W/GPU', total: 'W/GPU' },
      },
      'local-energy': {
        title: 'Role-local GPU energy',
        axis: 'GPU energy (J/token, log)',
        note: 'Prefill: prefill-pool joules ÷ input tokens. Decode: decode-pool joules ÷ output tokens. The denominators differ, so these two are not added.',
        units: { prefill: 'J/input token', decode: 'J/output token', total: 'J/output token' },
      },
      'output-energy': {
        title: 'GPU energy per output token by role',
        axis: 'GPU energy (J/output token, log)',
        note: 'Prefill energy restated per output token with the same window’s input:output token ratio, so prefill + decode is the request total.',
        units: { prefill: 'J/output token', decode: 'J/output token', total: 'J/output token' },
      },
      share: {
        title: 'Prefill energy share',
        axis: 'Prefill energy share (%)',
        note: 'Share = prefill ÷ (prefill + decode), both per output token. The dashed line marks 50%.',
        units: { prefill: '%', decode: '%', total: '%' },
      },
    } satisfies Record<
      RolePanelId,
      { title: string; axis: string; note: string; units: Record<RoleSeriesKey, string> }
    >,
  },
  zh: {
    title: '预填充与解码角色',
    method:
      '仅包含经过验证的分离式部署观测值。每个面板都注明了分母。缺少角色遥测数据的点不绘制，不会按 0 处理。',
    empty: '当前筛选条件下没有经过验证的预填充 / 解码遥测数据。',
    panelEmpty: '这些观测值没有报告该角色指标。',
    roles: { prefill: '预填充', decode: '解码', total: '预填充 + 解码' },
    panels: {
      power: {
        title: '各角色的平均 GPU 功耗',
        axis: '平均 GPU 功耗（W/GPU）',
        note: '有效测量窗口内各 GPU 池中每个 GPU 的平均板卡功耗。',
        units: { prefill: 'W/GPU', decode: 'W/GPU', total: 'W/GPU' },
      },
      'local-energy': {
        title: '各角色按本池 token 计的 GPU 能耗',
        axis: 'GPU 能耗（J/token，对数）',
        note: '预填充：预填充池焦耳数 ÷ 输入 token 数。解码：解码池焦耳数 ÷ 输出 token 数。两者分母不同，因此不相加。',
        units: { prefill: 'J/输入 token', decode: 'J/输出 token', total: 'J/输出 token' },
      },
      'output-energy': {
        title: '各角色每输出 token 的 GPU 能耗',
        axis: 'GPU 能耗（J/输出 token，对数）',
        note: '用同一窗口的输入:输出 token 比，把预填充能耗换算为每输出 token，因此预填充 + 解码等于整个请求的能耗。',
        units: { prefill: 'J/输出 token', decode: 'J/输出 token', total: 'J/输出 token' },
      },
      share: {
        title: '预填充能耗占比',
        axis: '预填充能耗占比（%）',
        note: '占比 = 预填充 ÷（预填充 + 解码），两者都按输出 token 计。虚线标记 50%。',
        units: { prefill: '%', decode: '%', total: '%' },
      },
    } satisfies Record<
      RolePanelId,
      { title: string; axis: string; note: string; units: Record<RoleSeriesKey, string> }
    >,
  },
};

const PANELS: {
  id: RolePanelId;
  series: { role: RoleSeriesKey; value: (point: RolePoint) => number | null }[];
  yLog?: boolean;
  reference?: number;
  yDomain?: [number, number];
  /** Share points stay unconnected: each is one observed configuration. */
  connect: boolean;
}[] = [
  {
    id: 'power',
    series: [
      { role: 'prefill', value: (point) => point.prefillWattsPerGpu },
      { role: 'decode', value: (point) => point.decodeWattsPerGpu },
    ],
    connect: true,
  },
  {
    id: 'local-energy',
    series: [
      { role: 'prefill', value: (point) => point.prefillJoulesPerInputToken },
      { role: 'decode', value: (point) => point.decodeJoulesPerOutputToken },
    ],
    yLog: true,
    connect: true,
  },
  {
    id: 'output-energy',
    series: [
      { role: 'prefill', value: (point) => point.energy?.prefill ?? null },
      { role: 'decode', value: (point) => point.energy?.decode ?? null },
      { role: 'total', value: (point) => point.energy?.total ?? null },
    ],
    yLog: true,
    connect: true,
  },
  {
    id: 'share',
    series: [{ role: 'prefill', value: (point) => point.energy?.prefillShare ?? null }],
    reference: 50,
    yDomain: [0, 100],
    connect: false,
  },
];
const ROLE_DASH: Record<RoleSeriesKey, string> = {
  prefill: powerVariantDash({ kind: 'role', id: 'prefill' }),
  decode: powerVariantDash({ kind: 'role', id: 'decode' }),
  total: '',
};
const value = d3.format(',.4~g');

export default function PowerRoleGroup({
  chartId,
  data,
  xField,
  xLabel,
  contextLabel,
  sources,
  colorOf,
}: {
  chartId: string;
  data: InferenceData[];
  xField: keyof AggDataEntry;
  xLabel: string;
  contextLabel?: string;
  sources: EqualServiceSource[];
  colorOf: (sourceKey: string) => string;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const points = useMemo(() => getRolePoints(data, xField), [data, xField]);
  const label = (key: string) => sources.find((source) => source.key === key)?.label ?? key;
  const isConcurrency = xField === 'conc';
  const concurrencies = isConcurrency ? [...new Set(points.map((point) => point.x))] : undefined;
  const sectionId = `${chartId}-roles`;

  const panel = (definition: (typeof PANELS)[number]) => {
    const copy = t.panels[definition.id];
    const plotId = `${chartId}-role-${definition.id}`;
    const markers: PanelMarker[] = definition.series.flatMap(({ role, value: read }) =>
      points.flatMap((point) => {
        const y = read(point);
        return y === null
          ? []
          : [
              {
                x: point.x,
                y,
                key: point.sourceKey,
                tooltip: [
                  `<strong>${escapeHtml(label(point.sourceKey))}</strong>`,
                  `${escapeHtml(xLabel)}: ${value(point.x)} · c${point.point.conc}`,
                  `${t.roles[role]}: ${value(y)} ${copy.units[role]}`,
                ].join('<br/>'),
              },
            ];
      }),
    );
    // Line keys become SVG class names, so they index the source rather than embed its key.
    const lines: PanelLine[] = definition.connect
      ? definition.series.flatMap(({ role, value: read }) =>
          [...new Set(points.map((point) => point.sourceKey))].map((sourceKey, index) => ({
            key: `source${index}-${role}`,
            color: colorOf(sourceKey),
            dash: ROLE_DASH[role],
            points: points
              .filter((point) => point.sourceKey === sourceKey)
              .map((point) => ({ x: point.x, y: read(point) ?? Number.NaN })),
          })),
        )
      : [];
    return (
      <figure key={definition.id} className="min-w-0 space-y-1">
        <figcaption className="text-sm font-medium">{copy.title}</figcaption>
        {markers.length > 0 ? (
          <PowerPanelPlot
            chartId={plotId}
            markers={markers}
            lines={lines}
            markerColor={colorOf}
            xLabel={xLabel}
            yLabel={copy.axis}
            reference={definition.reference ?? null}
            xLog={isConcurrency}
            yLog={definition.yLog}
            yDomain={definition.yDomain}
            xTickValues={concurrencies}
            height={300}
          />
        ) : (
          <p className="py-6 text-sm text-muted-foreground" data-testid={`${plotId}-empty`}>
            {t.panelEmpty}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{copy.note}</p>
      </figure>
    );
  };

  const exportCsv = () => {
    exportToCsv(
      'InferenceX_prefill_decode_roles',
      [
        'source',
        String(xField),
        'concurrency',
        'point_id',
        'run_url',
        'prefill_w_per_gpu',
        'decode_w_per_gpu',
        'prefill_j_per_input_token',
        'decode_j_per_output_token',
        'prefill_j_per_output_token',
        'total_j_per_output_token',
        'prefill_energy_share_pct',
      ],
      points.map((point) => [
        label(point.sourceKey),
        point.x,
        point.point.conc,
        point.point.id ?? null,
        point.point.run_url ?? null,
        point.prefillWattsPerGpu,
        point.decodeWattsPerGpu,
        point.prefillJoulesPerInputToken,
        point.decodeJoulesPerOutputToken,
        point.energy?.prefill ?? null,
        point.energy?.total ?? null,
        point.energy?.prefillShare ?? null,
      ]),
      contextLabel ? [contextLabel] : [],
    );
  };

  const shownSources = sources.filter((source) =>
    points.some((point) => point.sourceKey === source.key),
  );
  return (
    <section id={sectionId} className="min-w-0 space-y-3" data-testid="prefill-share-panel">
      <Heading as="h3" level="card">
        {t.title}
      </Heading>
      <p className="text-sm text-muted-foreground">{contextLabel}</p>
      <p className="text-xs text-muted-foreground">{t.method}</p>
      {points.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {shownSources.map((source) => (
              <span key={source.key} className="min-w-0 break-all">
                <span style={{ color: colorOf(source.key) }}>● </span>
                {source.label}
              </span>
            ))}
            {(['prefill', 'decode', 'total'] as const).map((role) => (
              <span key={role} className="inline-flex items-center gap-2">
                <svg width="28" height="10" aria-hidden="true">
                  <line
                    x1="0"
                    x2="28"
                    y1="5"
                    y2="5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray={ROLE_DASH[role] || undefined}
                  />
                </svg>
                {t.roles[role]}
              </span>
            ))}
          </div>
          <div className="grid min-w-0 gap-6 lg:grid-cols-2">{PANELS.map(panel)}</div>
          <div className="max-h-0 overflow-hidden">
            <div id={`${sectionId}-export`} className="p-4" />
          </div>
          <ChartButtons
            chartId={sectionId}
            analyticsPrefix="power_roles"
            hideZoomReset
            onExportCsv={exportCsv}
          />
        </>
      ) : (
        <p className="py-6 text-sm text-muted-foreground">{t.empty}</p>
      )}
    </section>
  );
}
