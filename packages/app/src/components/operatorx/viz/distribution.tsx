'use client';

import { useState } from 'react';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { distributionView } from '@/lib/operatorx/distribution-view';

import { EmptyChart } from '../charts/empty';
import { OpxChart, tooltipHtml } from '../charts/kit';
import { type BoxDatum, boxLayer } from '../charts/layers';
import { valueScale } from '../charts/scales';
import { hardwareLabel } from '../compare/hardware';
import { metricById } from '../compare/metrics';
import type { ComparisonModel } from '../compare/model';
import type { VizDefinition } from './types';

const STRINGS = {
  en: {
    matchedOnly: 'Matched only',
    normalized: 'Normalized',
    noMeasured: 'No measured cases.',
    cases: 'cases',
    median: 'median',
    computeAxis: 'Share of peak compute (%)',
    bandwidthAxis: 'Share of peak bandwidth (%)',
    peakNote: 'Cases without a documented peak for their precision are omitted.',
    ascendBandwidthNote: '950PR bandwidth uses an assumed 1.6 TB/s peak.',
  },
  zh: {
    matchedOnly: '仅显示匹配用例',
    normalized: '归一化',
    noMeasured: '没有实测用例。',
    cases: '个用例',
    median: '中位数',
    computeAxis: '计算峰值占比（%）',
    bandwidthAxis: '带宽峰值占比（%）',
    peakNote: '未公布对应精度峰值的用例不计入统计。',
    ascendBandwidthNote: '950PR 带宽峰值按假定的 1.6 TB/s 计算。',
  },
};

function Distribution({ model }: { model: ComparisonModel }) {
  const strings = STRINGS[useLocale()];
  const [pickedCommon, setCommon] = useState(true);
  const [pickedNormalized, setNormalized] = useState(false);
  const normalizable = model.metric.id === 'tflops' || model.metric.id === 'bandwidth';
  const distribution = distributionView(model.view, {
    metric: model.metric.id,
    hardware: model.hardware,
    matchedOnly: pickedCommon,
    normalized: pickedNormalized,
  });
  const metric = metricById(distribution.metric);
  const boxes: (BoxDatum & { n: number })[] = distribution.boxes.map((box) => ({
    ...box,
    band: box.hardware,
    color: model.colors[box.hardware],
  }));
  const yLabel = distribution.normalized
    ? distribution.metric === 'computeUtil'
      ? strings.computeAxis
      : strings.bandwidthAxis
    : `${metric.label} (${metric.unit})`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {distribution.matchedCases > 0 && (
          <div className="flex items-center gap-2">
            <Switch
              id="opx-dist-common"
              checked={distribution.matchedOnly}
              onCheckedChange={(checked) => {
                setCommon(checked);
                track('operatorx_distribution_matched_changed', { enabled: checked });
              }}
            />
            <Label htmlFor="opx-dist-common" className="text-sm font-normal text-muted-foreground">
              {strings.matchedOnly}
            </Label>
          </div>
        )}
        {normalizable && (
          <div className="flex items-center gap-2">
            <Switch
              id="opx-dist-normalized"
              checked={distribution.normalized}
              onCheckedChange={(checked) => {
                setNormalized(checked);
                track('operatorx_distribution_normalized_changed', {
                  enabled: checked,
                  metric: model.metric.id,
                });
              }}
            />
            <Label
              htmlFor="opx-dist-normalized"
              className="text-sm font-normal text-muted-foreground"
            >
              {strings.normalized}
            </Label>
          </div>
        )}
      </div>
      {distribution.normalized && (
        <p className="text-xs text-muted-foreground">
          {strings.peakNote}
          {distribution.metric === 'bandwidthUtil' && model.hardware.includes('ascend950pr') && (
            <> {strings.ascendBandwidthNote}</>
          )}
        </p>
      )}
      {boxes.length === 0 ? (
        <EmptyChart>{strings.noMeasured}</EmptyChart>
      ) : (
        <OpxChart<BoxDatum & { n: number }>
          chartId="operatorx-distribution"
          data={boxes}
          height={320}
          margin={{ top: 16, right: 16, bottom: 44, left: 72 }}
          xScale={{ type: 'band', domain: boxes.map((b) => b.band), padding: 0.4 }}
          yScale={valueScale(
            metric.log,
            boxes.flatMap((b) => [b.p5, b.p95]),
          )}
          xAxis={{ tickFormat: (v) => hardwareLabel(String(v)), grid: false }}
          yAxis={{
            label: yLabel,
            tickCount: 5,
            tickFormat: (v) => metric.tick(Number(v)),
          }}
          layers={[boxLayer({ key: 'boxes', data: boxes })]}
          tooltip={{
            rulerType: 'none',
            content: (b) =>
              tooltipHtml({
                title: hardwareLabel(b.band),
                color: b.color,
                rows: [
                  `${b.n} ${strings.cases}`,
                  `${strings.median} <strong>${metric.format(b.p50)}</strong>`,
                  `p25–p75 ${metric.format(b.p25)} – ${metric.format(b.p75)}`,
                  `p5–p95 ${metric.format(b.p5)} – ${metric.format(b.p95)}`,
                ],
              }),
          }}
        />
      )}
    </div>
  );
}

export const distribution: VizDefinition = {
  id: 'distribution',
  title: 'Distribution per GPU',
  ops: ['gemm', 'moe'],
  Component: Distribution,
};
