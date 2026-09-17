'use client';

import { useQueries } from '@tanstack/react-query';
import { curveLinear, type ScaleLinear } from 'd3';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useClientSearchParams } from '@/hooks/useClientSearch';
import { track } from '@/lib/analytics';
import { getModelAndSequence } from '@/lib/data-mappings';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { useLocale } from '@/lib/use-locale';
import type { GpuPowerRunInfo } from './types';
import {
  buildServingPowerTrace,
  type PowerAuditArtifact,
  type PowerAuditWindow,
  type ServingPowerTrace,
} from './power-audit';

const STRINGS = {
  en: {
    run: 'Run',
    compareRun: 'Compare with run ID',
    load: 'Compare',
    artifact: 'Artifact',
    window: 'Serving window',
    title: 'GPU board power during serving',
    elapsed: 'Time from serving-window start (s)',
    watts: 'Role-pool power (W)',
    prefill: 'Prefill',
    decode: 'Decode',
    aggregated: 'All GPUs',
    mean: 'Mean',
    sampleMax: 'Sample max',
    duration: 'Duration',
    tdp: 'Registry TDP',
    gpus: 'GPUs',
    concurrency: 'Concurrency',
    loading: 'Loading power audit…',
    failed: 'Power audit unavailable. Check the run ID and retained artifacts.',
    invalid:
      'This window cannot be plotted: valid power coverage, consistent device roles, and matching integrated energy are required.',
    empty: 'No serving-window power audit is available.',
    note: 'GPU board power; roles identify serving pools, not kernel phases. Endpoints are linearly interpolated. Sample maxima do not resolve peaks between samples.',
    tdpNote:
      'TDP is the current hardware-registry reference, not a measured draw or a recorded run power cap.',
    cadence: 'Nominal sample interval',
    source: 'Source',
    input: 'input',
    output: 'output',
  },
  zh: {
    run: '运行',
    compareRun: '对比运行 ID',
    load: '对比',
    artifact: '产物',
    window: 'Serving 窗口',
    title: 'Serving 期间的 GPU 板级功耗',
    elapsed: '距 serving 窗口起点的时间 (s)',
    watts: '角色池功耗 (W)',
    prefill: 'Prefill',
    decode: 'Decode',
    aggregated: '全部 GPU',
    mean: '均值',
    sampleMax: '采样最大值',
    duration: '时长',
    tdp: '硬件注册表 TDP',
    gpus: 'GPU',
    concurrency: '并发数',
    loading: '正在加载功耗审计数据…',
    failed: '无法读取功耗审计数据，请检查运行 ID 及保留的产物。',
    invalid:
      '无法绘制此窗口：需要有效的功耗覆盖、明确一致的设备角色，以及与验证结果一致的积分能耗。',
    empty: '没有可用的 serving 窗口功耗审计数据。',
    note: 'GPU 板级功耗；角色表示 serving 资源池，不表示 kernel 阶段。窗口端点采用线性插值；采样最大值不代表采样间隔内的峰值。',
    tdpNote: 'TDP 来自当前硬件注册表，不是实测功耗，也不代表该运行记录的功率上限。',
    cadence: '标称采样间隔',
    source: '来源',
    input: '输入',
    output: '输出',
  },
} as const;

interface AuditResponse {
  runInfo: GpuPowerRunInfo;
  powerAudits: PowerAuditArtifact[];
}

async function fetchAudit(runId: string, signal: AbortSignal): Promise<AuditResponse> {
  const response = await fetch(
    `/api/gpu-metrics?runId=${encodeURIComponent(runId)}&source=power-audit`,
    { cache: 'no-store', signal },
  );
  if (!response.ok) throw new Error('audit unavailable');
  return response.json();
}

export function ServingPowerChart({
  artifact,
  window,
  trace,
  index,
  yMax,
}: {
  artifact: PowerAuditArtifact;
  window: PowerAuditWindow;
  trace: ServingPowerTrace;
  index: number;
  yMax: number;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const color = index === 0 ? '#29a8df' : '#e5a637';
  const roleLabel = (role: string) => t[role as 'prefill' | 'decode' | 'aggregated'] ?? role;
  const data = trace.roles.flatMap((role) => role.points);
  const modelSequence = getModelAndSequence(artifact.name);
  const precision = artifact.name
    .match(/_(?<precision>fp8|bf16|fp4|nvfp4|int4|int8)_/u)
    ?.groups?.precision.toUpperCase();
  return (
    <div className="min-w-0" data-testid="serving-power-panel">
      <h3 className="text-base font-semibold">
        {trace.hardware || artifact.name} · {trace.duration.toFixed(1)} s
      </h3>
      <p className="text-xs text-muted-foreground">
        {modelSequence?.model} {precision} · {modelSequence?.sequence} · {t.concurrency}{' '}
        {window.concurrency}
      </p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {trace.roles.map((role) => (
          <span key={role.role}>
            {roleLabel(role.role)} ({role.gpuCount} {t.gpus}): {t.mean} {role.meanWatts.toFixed(0)}{' '}
            W · {t.sampleMax} {role.maxSample.y.toFixed(0)} W
          </span>
        ))}
      </div>
      <D3Chart
        chartId={`serving-power-${index}`}
        data={data}
        height={390}
        margin={{ top: 32, right: 16, bottom: 58, left: 64 }}
        watermark="logo"
        testId={`serving-power-chart-${index}`}
        instructions=""
        grabCursor={false}
        xScale={{ type: 'linear', domain: [0, trace.duration], nice: false }}
        yScale={{ type: 'linear', domain: [0, yMax], nice: true }}
        xAxis={{ label: t.elapsed, tickCount: 6 }}
        yAxis={{ label: t.watts, tickCount: 6 }}
        layers={[
          {
            type: 'line',
            key: 'roles',
            lines: Object.fromEntries(trace.roles.map((role) => [role.role, role.points])),
            config: {
              getColor: () => color,
              getStrokeDasharray: (role) => (role === 'prefill' ? '6,4' : 'none'),
              curve: curveLinear,
              strokeWidth: 2,
            },
          },
          {
            type: 'custom',
            key: 'tdp',
            render: (group, ctx) => {
              group.selectAll('.serving-tdp').remove();
              const layer = group.append('g').attr('class', 'serving-tdp');
              const limits = new Map<number, string[]>();
              for (const role of trace.roles)
                if (role.tdpWatts)
                  limits.set(role.tdpWatts, [
                    ...(limits.get(role.tdpWatts) ?? []),
                    roleLabel(role.role),
                  ]);
              for (const [watts, labels] of limits) {
                const y = Number((ctx.yScale as ScaleLinear<number, number>)(watts));
                layer
                  .append('line')
                  .attr('class', 'serving-tdp-line')
                  .attr('x1', 0)
                  .attr('x2', ctx.width)
                  .attr('y1', y)
                  .attr('y2', y)
                  .attr('stroke', '#ef4444')
                  .attr('stroke-dasharray', '3,5');
                layer
                  .append('text')
                  .attr('x', ctx.width - 4)
                  .attr('y', y - 7)
                  .attr('text-anchor', 'end')
                  .attr('fill', '#ef4444')
                  .attr('font-size', px(CHART_TYPE.annotation))
                  .text(`${labels.join('/')} ${t.tdp}: ${watts.toFixed(0)} W`);
              }
            },
          },
          {
            type: 'custom',
            key: 'sample-max',
            render: (group, ctx) => {
              group.selectAll('.serving-max').remove();
              const layer = group.append('g').attr('class', 'serving-max');
              for (const role of trace.roles) {
                const x = Number((ctx.xScale as ScaleLinear<number, number>)(role.maxSample.x));
                const y = Number((ctx.yScale as ScaleLinear<number, number>)(role.maxSample.y));
                layer.append('circle').attr('cx', x).attr('cy', y).attr('r', 3).attr('fill', color);
              }
            },
          },
        ]}
      />
    </div>
  );
}

export default function ServingPowerComparison({
  runId,
  onShareSearchChange,
}: {
  runId: string | null;
  onShareSearchChange?: (search: string | null) => void;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const params = useClientSearchParams();
  const [compareInput, setCompareInput] = useState(params.get('gm_compareRunId') ?? '');
  const [compareRun, setCompareRun] = useState(params.get('gm_compareRunId') ?? '');
  const [selections, setSelections] = useState(() => [
    {
      artifact: params.get('gm_artifact') ?? '',
      artifactId: params.get('gm_artifactId') ?? '',
      window: params.get('gm_window') ?? '',
    },
    {
      artifact: params.get('gm_compareArtifact') ?? '',
      artifactId: params.get('gm_compareArtifactId') ?? '',
      window: params.get('gm_compareWindow') ?? '',
    },
  ]);
  const runIds = [runId ?? '', compareRun];
  const queries = useQueries({
    queries: runIds.map((id) => ({
      queryKey: ['gpu-serving-power', id],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchAudit(id, signal),
      enabled: /^\d+$/u.test(id),
      staleTime: 0,
      gcTime: 0,
      retry: false,
    })),
  });
  const panels = useMemo(
    () =>
      queries.map((query, index) => {
        const artifacts = query.data?.powerAudits ?? [];
        const selection = selections[index];
        // A shared source is an explicit selection, not permission to substitute
        // another artifact or concurrency when the retained data is unavailable.
        const artifact = selection.artifactId
          ? artifacts.find((item) => String(item.id) === selection.artifactId)
          : selection.artifact
            ? artifacts.find((item) => item.name === selection.artifact)
            : artifacts[0];
        const window = selection.window
          ? artifact?.windows.find((item) => item.name === selection.window)
          : artifact?.windows[0];
        let trace: ServingPowerTrace | undefined;
        if (artifact && window) {
          try {
            trace = buildServingPowerTrace(artifact, window);
          } catch {
            // One unavailable source must not prevent the other valid panel from rendering.
          }
        }
        return { artifact, window, trace, artifacts };
      }),
    [queries[0].data, queries[1].data, selections],
  );
  const yMax =
    Math.max(
      1,
      ...panels.flatMap(
        (panel) =>
          panel.trace?.roles.flatMap((role) => [
            role.maxSample.y,
            role.tdpWatts ?? 0,
            ...role.points.map((p) => p.y),
          ]) ?? [],
      ),
    ) * 1.12;
  const select = (index: number, field: 'artifact' | 'window', value: string) => {
    setSelections((current) =>
      current.map((selection, i) =>
        i === index
          ? field === 'artifact'
            ? { artifact: '', artifactId: value, window: '' }
            : { ...selection, window: value }
          : selection,
      ),
    );
    track('gpu_metrics_serving_selection', { index, field, value });
  };
  const shareSearch = (() => {
    if (!panels[0].trace || (compareRun && !panels[1].trace)) return null;
    const search = new URLSearchParams({ gm_view: 'serving', gm_runId: runId ?? '' });
    if (compareRun) search.set('gm_compareRunId', compareRun);
    panels.forEach((panel, index) => {
      if (panel.artifact) {
        search.set(index ? 'gm_compareArtifact' : 'gm_artifact', panel.artifact.name);
        search.set(index ? 'gm_compareArtifactId' : 'gm_artifactId', String(panel.artifact.id));
      }
      if (panel.window) search.set(index ? 'gm_compareWindow' : 'gm_window', panel.window.name);
    });
    return search.toString();
  })();
  useEffect(() => {
    onShareSearchChange?.(shareSearch);
  }, [shareSearch, onShareSearchChange]);
  return (
    <div data-testid="serving-power-comparison">
      <Card className="mb-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="serving-compare-run">{t.compareRun}</Label>
            <Input
              id="serving-compare-run"
              inputMode="numeric"
              value={compareInput}
              onChange={(event) => setCompareInput(event.target.value)}
            />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setCompareRun(compareInput.trim());
              setSelections((current) => [
                current[0],
                { artifact: '', artifactId: '', window: '' },
              ]);
              track('gpu_metrics_serving_compare', { runId: compareInput.trim() });
            }}
            disabled={compareInput !== '' && !/^\d+$/u.test(compareInput.trim())}
          >
            {t.load}
          </Button>
        </div>
        <div className={`grid gap-4 ${compareRun ? 'lg:grid-cols-2' : ''}`}>
          {panels.map(
            (panel, index) =>
              runIds[index] && (
                <div key={index} className="min-w-0 space-y-2">
                  <p className="text-sm font-medium">
                    {t.run} #{runIds[index]}
                  </p>
                  {queries[index].isFetching && (
                    <p role="status" className="text-sm text-muted-foreground">
                      {t.loading}
                    </p>
                  )}
                  {(queries[index].isError || !/^\d+$/u.test(runIds[index])) && (
                    <p role="alert" className="text-sm text-destructive">
                      {t.failed}
                    </p>
                  )}
                  {queries[index].isSuccess && (!panel.artifact || !panel.window) && (
                    <p role="alert" className="break-words text-sm text-destructive">
                      {t.failed} {selections[index].artifactId || selections[index].artifact}{' '}
                      {selections[index].window}
                    </p>
                  )}
                  {panel.artifacts.length > 0 && (
                    <>
                      <Label htmlFor={`serving-artifact-${index}`}>{t.artifact}</Label>
                      <Select
                        value={panel.artifact ? String(panel.artifact.id) : ''}
                        onValueChange={(value) => select(index, 'artifact', value)}
                      >
                        <SelectTrigger id={`serving-artifact-${index}`} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {panel.artifacts.map((artifact) => (
                            <SelectItem key={artifact.id} value={String(artifact.id)}>
                              {artifact.name} · {artifact.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Label htmlFor={`serving-window-${index}`}>{t.window}</Label>
                      <Select
                        value={panel.window?.name ?? ''}
                        disabled={!panel.artifact}
                        onValueChange={(value) => select(index, 'window', value)}
                      >
                        <SelectTrigger id={`serving-window-${index}`} className="w-full min-w-0">
                          <SelectValue className="min-w-0 truncate" />
                        </SelectTrigger>
                        <SelectContent>
                          {panel.artifact?.windows.map((window) => (
                            <SelectItem key={window.name} value={window.name}>
                              {t.concurrency} {window.concurrency} · {window.result_path}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {panel.window && !panel.trace && (
                        <p role="alert" className="text-sm text-destructive">
                          {t.invalid}
                        </p>
                      )}
                    </>
                  )}
                </div>
              ),
          )}
        </div>
      </Card>
      {panels.some((panel) => panel.trace) && (
        <>
          <Card id="serving-power-figure" className="relative" data-testid="serving-power-figure">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{t.title}</h2>
              <ChartButtons
                chartId="serving-power-figure"
                analyticsPrefix="gpu_timeseries"
                hideZoomReset
              />
            </div>
            <div className="my-3 flex flex-wrap gap-4 text-sm">
              {[
                ...new Set(
                  panels.flatMap((panel) => panel.trace?.roles.map((role) => role.role) ?? []),
                ),
              ].map((role) => (
                <span key={role}>
                  {role === 'prefill' ? '┄' : '━'}{' '}
                  {t[role as 'prefill' | 'decode' | 'aggregated'] ?? role}
                </span>
              ))}
            </div>
            <div className={`grid gap-6 ${compareRun ? 'lg:grid-cols-2' : ''}`}>
              {panels.map(
                (panel, index) =>
                  panel.trace &&
                  panel.artifact &&
                  panel.window && (
                    <ServingPowerChart
                      key={index}
                      {...{
                        artifact: panel.artifact,
                        window: panel.window,
                        trace: panel.trace,
                        index,
                        yMax,
                      }}
                    />
                  ),
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t.note} {t.tdpNote}
            </p>
            {panels.map(
              (panel, index) =>
                panel.trace &&
                panel.artifact && (
                  <p key={index} className="mt-1 text-xs text-muted-foreground">
                    {panel.trace.hardware} · {t.cadence}:{' '}
                    {panel.artifact.manifest.sample_interval_seconds} s · {t.source}:{' '}
                    <a
                      className="underline"
                      href={`https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${runIds[index]}/artifacts/${panel.artifact.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.run} {runIds[index]}, {t.artifact} {panel.artifact.id}
                    </a>
                  </p>
                ),
            )}
          </Card>
          <div className="overflow-hidden max-h-0">
            <div id="serving-power-figure-export" className="p-4" />
          </div>
        </>
      )}
    </div>
  );
}
