'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { useOperatorXRun, useOperatorXRuns } from '@/hooks/api/use-operatorx';
import { useClientSearchParams } from '@/hooks/useClientSearch';
import { track } from '@/lib/analytics';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import { useLocale } from '@/lib/use-locale';
import { escapeHtml } from '@/lib/utils';
import type { OperatorXPoint } from '@semianalysisai/inferencex-db/operatorx/reader';
import { useMemo, useState } from 'react';

import { precision, selectOperatorPoints, shape, x } from './view-data';

const STRINGS = {
  en: {
    description: 'GEMM, attention and routed MoE performance from OperatorX GitHub Actions runs.',
    operator: 'Operator',
    attention_mha: 'MHA / GQA',
    attention_mla: 'MLA (materialized Q/K/V)',
    gemm: 'GEMM',
    moe_gemm: 'MoE (routed experts)',
    moePrecision: 'Precision (activation / weight)',
    moeShape: 'MoE shape',
    moeChart: 'Measured routed MoE performance',
    tokensAxis: 'Local tokens (log scale)',
    moeMethod:
      'Per-GPU routed matmul TFLOPS = 6 × local tokens × hidden × (top-k × local intermediate + shared experts × intermediate ÷ shared TP) ÷ latency (µs) ÷ 10⁶. EP/TP describe local weight shapes; one GPU is timed and no communication is included. The Kimi K3 vLLM benchmark profile uses generic SiLU experts and precomputed local routing; native K3 SITU, latent projections and shared experts are outside that profile. Compare the same profile, precision and shard shape.',
    attentionPrecision: 'Precision (Q / K / V → output)',
    attentionShape: 'Attention shape',
    attentionChart: 'Measured attention performance',
    batchAxis: 'Batch size (log scale)',
    lowest: 'Lowest latency in selection',
    attentionMethod:
      'Attention TFLOPS = 2 × batch size × query heads × valid Q/K pairs × (QK dimension + V dimension) ÷ latency (µs) ÷ 10⁶, per GPU. Causal masks count only visible pairs, including the diagonal; decode sees all KV. This counts useful QK and AV matmul work, excluding softmax, cache projection and RoPE. MLA uses materialized Q/K/V. PyTorch expands grouped KV before timing; AITER uses native grouped heads. Compare identical shapes, precisions, and backends.',
    run: 'Run',
    refresh: 'Refresh',
    loading: 'Loading OperatorX results…',
    unavailable: 'OperatorX results are unavailable.',
    empty: 'No OperatorX runs have been imported yet.',
    source: 'Source',
    measured: 'Measured',
    unsupported: 'Unsupported',
    error: 'Failed',
    missing: 'Missing',
    ok: 'Measured',
    all: 'All',
    requested: 'Requested',
    precision: 'Precision (A / B → output)',
    shape: 'Shape (N × K)',
    backend: 'Backend',
    cluster: 'System',
    status: 'Status',
    metric: 'Metric',
    tflops: 'TFLOPS / GPU',
    latency: 'Latency (µs)',
    peak: 'Peak in selection',
    method:
      'Dense GEMM TFLOPS = 2 × M × N × K ÷ latency (µs) ÷ 10⁶. One GPU per measurement; allocating an eight-GPU node does not multiply the reported rate. Only successful positive-size measurements appear in the chart.',
    chart: 'Measured GEMM performance',
    xAxis: 'M (log scale)',
    noPoints: 'No measured points match these filters.',
    results: 'Case results',
    details: 'Details',
    previous: 'Previous',
    next: 'Next',
    page: 'Page',
    attempt: 'Attempt',
    noRows: 'No cases match these filters.',
    instructions: 'Shift+Scroll to zoom · Drag to pan · Double-click to reset',
    coverage: 'Run coverage',
    reset: 'Reset filters',
    note: 'Coverage counts refer to the entire selected run. Unsupported, failed, and missing cases have no TFLOPS value.',
  },
  zh: {
    description: '来自 OperatorX GitHub Actions 运行的 GEMM、attention 和路由 MoE 性能数据。',
    operator: '算子',
    attention_mha: 'MHA / GQA',
    attention_mla: 'MLA（物化 Q/K/V）',
    gemm: 'GEMM',
    moe_gemm: 'MoE（路由专家）',
    moePrecision: '精度（激活 / 权重）',
    moeShape: 'MoE 形状',
    moeChart: '路由 MoE 实测性能',
    tokensAxis: '本地 token 数（对数坐标）',
    moeMethod:
      '单卡路由矩阵乘法 TFLOPS = 6 × 本地 token 数 × hidden ×（top-k × 本地 intermediate + 共享专家数 × intermediate ÷ shared TP）÷ 延迟（µs）÷ 10⁶。EP/TP 表示本地权重形状；每次只测量一张 GPU，不包含通信。Kimi K3 vLLM benchmark profile 使用通用 SiLU 专家和预先生成的本地路由，不包含原生 K3 的 SITU、latent 投影或共享专家。比较时需保持测试配置、精度和分片形状一致。',
    attentionPrecision: '精度（Q / K / V → 输出）',
    attentionShape: 'Attention 形状',
    attentionChart: 'Attention 实测性能',
    batchAxis: 'Batch size（对数坐标）',
    lowest: '当前筛选结果最低延迟',
    attentionMethod:
      'Attention 单卡 TFLOPS = 2 × batch size × query head 数 × 有效 Q/K 对数 ×（QK 维度 + V 维度）÷ 延迟（µs）÷ 10⁶。因果掩码只计入可见位置，包含对角线；decode 可访问全部 KV。该指标统计 QK 和 AV 矩阵乘法的有效计算量，不计 softmax、缓存投影或 RoPE。MLA 使用物化 Q/K/V。PyTorch 在计时前展开分组 KV，AITER 使用原生分组 head。比较时需保持形状、精度和后端一致。',
    run: '运行',
    refresh: '刷新',
    loading: '正在加载 OperatorX 结果…',
    unavailable: '暂时无法获取 OperatorX 结果。',
    empty: '尚未导入 OperatorX 运行。',
    source: '源码',
    measured: '已测量',
    unsupported: '不支持',
    error: '失败',
    missing: '缺失',
    ok: '已测量',
    all: '全部',
    requested: '计划测试',
    precision: '精度（A / B → 输出）',
    shape: '矩阵形状（N × K）',
    backend: '后端',
    cluster: '系统',
    status: '状态',
    metric: '指标',
    tflops: 'TFLOPS / GPU',
    latency: '延迟（µs）',
    peak: '当前筛选结果峰值',
    method:
      '稠密 GEMM TFLOPS = 2 × M × N × K ÷ 延迟（µs）÷ 10⁶。每次测量使用一张 GPU；分配八卡节点不会使显示的性能乘以八。图表仅显示成功且各维度大于零的测量结果。',
    chart: 'GEMM 实测性能',
    xAxis: 'M（对数坐标）',
    noPoints: '当前筛选条件下没有实测数据。',
    results: '测试结果',
    details: '详情',
    previous: '上一页',
    next: '下一页',
    page: '页',
    attempt: '尝试次数',
    noRows: '没有符合筛选条件的测试。',
    instructions: 'Shift+滚轮缩放 · 拖动平移 · 双击重置',
    coverage: '运行覆盖情况',
    reset: '重置筛选',
    note: '覆盖数量统计整次运行。不支持、失败和缺失的测试没有 TFLOPS 值。',
  },
} as const;
const colors: Record<string, string> = {
  bf16: '#22c55e',
  fp16: '#14b8a6',
  fp8: '#3b82f6',
  fp4: '#a855f7',
  nvfp4: '#f59e0b',
  mxfp4: '#ec4899',
  int4: '#f97316',
};
const pointDtype = (p: OperatorXPoint) =>
  p.moe?.dtype_act ?? p.attention?.dtype_q ?? p.dtype_a ?? '';
const selectClass = 'bg-background border-input h-10 w-full rounded-md border px-3 text-sm';
const format = (value: number | null) =>
  value === null
    ? '—'
    : value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        className={selectClass}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
export default function OperatorXDisplay() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const search = useClientSearchParams();
  const runs = useOperatorXRuns();
  const [selected, setSelected] = useState('');
  const runId =
    selected ||
    search.get('run') ||
    runs.data?.runs.find((r) => r.measured > 0)?.run_id ||
    runs.data?.runs[0]?.run_id ||
    '';
  const query = useOperatorXRun(runId);
  const [filters, setFilters] = useState({
    precision: '',
    shape: '',
    backend: '',
    cluster: '',
    status: 'ok',
  });
  const [metric, setMetric] = useState('tflops');
  const [operator, setOperator] = useState('');
  const [page, setPage] = useState(0);
  const points = query.data?.points;
  const kinds = [...new Set((points ?? []).map((p) => p.type))];
  const selectedOperator = kinds.find((kind) => kind === operator) ?? kinds[0] ?? 'gemm';
  const isAttention = selectedOperator === 'attention_mha' || selectedOperator === 'attention_mla';
  const isMoe = selectedOperator === 'moe_gemm';
  const precisionLabel = isMoe ? t.moePrecision : isAttention ? t.attentionPrecision : t.precision;
  const shapeLabel = isMoe ? t.moeShape : isAttention ? t.attentionShape : t.shape;
  const filtered = useMemo(
    () => selectOperatorPoints(points ?? [], selectedOperator, filters, metric),
    [points, filters, selectedOperator, metric],
  );
  const plotted = useMemo(
    () =>
      filtered.filter(
        (p) =>
          p.status === 'ok' &&
          x(p) > 0 &&
          (metric === 'latency' ? p.latency_us !== null : p.tflops !== null),
      ),
    [filtered, metric],
  );
  const displayedPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 100) - 1));
  const options = (key: 'precision' | 'shape' | 'backend' | 'cluster') => [
    { value: '', label: t.all },
    ...[
      ...new Set(
        (points ?? [])
          .filter((p) => p.type === selectedOperator)
          .map((p) => (key === 'precision' ? precision(p) : key === 'shape' ? shape(p) : p[key])),
      ),
    ]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((value) => ({ value, label: value })),
  ];
  const change = (key: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
    track('operatorx_filter_changed', { filter: key, value });
  };
  const y = (p: OperatorXPoint) => (metric === 'tflops' ? p.tflops! : p.latency_us!);
  const xValues = plotted.map(x);
  const yValues = plotted.map(y);
  const minX = xValues.length > 0 ? Math.min(...xValues) : 1;
  const maxX = Math.max(...xValues, 2);
  const maxY = Math.max(...yValues, 1);
  const peak =
    metric === 'latency'
      ? Math.min(...plotted.map((p) => p.latency_us!))
      : Math.max(...plotted.map((p) => p.tflops!), 0);
  const run = query.data?.run;
  return (
    <div className="space-y-6" data-testid="operatorx-display">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading as="h1">OperatorX</Heading>
          <p className="text-muted-foreground mt-2">{t.description}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void runs.refetch();
            void query.refetch();
            track('operatorx_refresh');
          }}
        >
          {t.refresh}
        </Button>
      </div>
      <Card className="space-y-4 p-5">
        <Filter
          label={t.run}
          value={runId}
          options={(runs.data?.runs ?? []).map((r) => ({
            value: r.run_id,
            label: `#${r.run_id} · ${r.clusters.join(', ')} · ${r.testlists.join(', ')} · ${r.measured}/${r.requested}`,
          }))}
          onChange={(value) => {
            setSelected(value);
            setOperator('');
            setFilters({ precision: '', shape: '', backend: '', cluster: '', status: 'ok' });
            setPage(0);
            track('operatorx_run_selected', { run_id: value });
          }}
        />
        {run && (
          <div className="flex flex-wrap gap-4 text-sm">
            <a
              className="underline"
              href={`https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${run.run_id}`}
              target="_blank"
              rel="noreferrer"
            >
              #{run.run_id} · {run.conclusion} · {t.attempt} {run.run_attempt}
            </a>
            <a
              className="underline"
              href={`https://github.com/SemiAnalysisAI/InferenceX/tree/${run.source_sha}/experimental/operatorx`}
              target="_blank"
              rel="noreferrer"
            >
              {t.source} {run.source_sha.slice(0, 8)}
            </a>
            <span className="text-muted-foreground">{run.source_branch}</span>
          </div>
        )}
      </Card>
      {(runs.isPending || query.isLoading) && <p role="status">{t.loading}</p>}
      {(runs.isError || query.isError) && <p role="alert">{t.unavailable}</p>}
      {!runs.isPending && !runs.isError && !runId && <p>{t.empty}</p>}
      {run && (
        <>
          <section aria-label={t.coverage} className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {(['requested', 'measured', 'unsupported', 'failed', 'missing'] as const).map((key) => (
              <Card className="p-4" key={key}>
                <p className="text-muted-foreground text-sm">
                  {key === 'failed' ? t.error : t[key]}
                </p>
                <p
                  className="mt-1 text-2xl font-semibold tabular-nums"
                  data-testid={`operatorx-${key}`}
                >
                  {run[key].toLocaleString('en-US')}
                </p>
              </Card>
            ))}
          </section>
          <Card className="space-y-4 p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Filter
                label={t.operator}
                value={selectedOperator}
                options={kinds.map((value) => ({ value, label: t[value] }))}
                onChange={(value) => {
                  setOperator(value);
                  setFilters({ precision: '', shape: '', backend: '', cluster: '', status: 'ok' });
                  setPage(0);
                  track('operatorx_operator_changed', { value });
                }}
              />
              {(['precision', 'shape', 'backend', 'cluster'] as const).map((key) => (
                <Filter
                  key={key}
                  label={
                    key === 'precision' ? precisionLabel : key === 'shape' ? shapeLabel : t[key]
                  }
                  value={filters[key]}
                  options={options(key)}
                  onChange={(value) => change(key, value)}
                />
              ))}
              <Filter
                label={t.status}
                value={filters.status}
                options={['', 'ok', 'unsupported', 'error', 'missing'].map((value) => ({
                  value,
                  label: value ? t[value as 'ok' | 'unsupported' | 'error' | 'missing'] : t.all,
                }))}
                onChange={(value) => change('status', value)}
              />
              <Filter
                label={t.metric}
                value={metric}
                options={[
                  { value: 'tflops', label: t.tflops },
                  { value: 'latency', label: t.latency },
                ]}
                onChange={(value) => {
                  setMetric(value);
                  setPage(0);
                  track('operatorx_metric_changed', { value });
                }}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setFilters({ precision: '', shape: '', backend: '', cluster: '', status: 'ok' });
                setPage(0);
                track('operatorx_filters_reset');
              }}
            >
              {t.reset}
            </Button>
            <p className="text-muted-foreground text-sm">{t.note}</p>
          </Card>
          <Card className="overflow-hidden p-3 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Heading as="h2">
                {isMoe ? t.moeChart : isAttention ? t.attentionChart : t.chart}
              </Heading>
              <p data-testid="operatorx-peak" className="text-xl font-semibold tabular-nums">
                {metric === 'latency' ? t.lowest : t.peak}:{' '}
                {plotted.length > 0 ? format(peak) : '—'}{' '}
                {metric === 'latency' ? 'µs' : 'TFLOPS / GPU'}
                {plotted[0] && (
                  <span className="text-muted-foreground ml-2 text-sm">
                    {precision(plotted[0])}
                  </span>
                )}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              {[...new Set(plotted.map(pointDtype))].sort().map((dtype) => (
                <span key={dtype}>
                  <span aria-hidden="true" style={{ color: colors[dtype] ?? '#888' }}>
                    ●{' '}
                  </span>
                  {dtype.toUpperCase()}
                </span>
              ))}
            </div>
            {plotted.length > 0 ? (
              <D3Chart<OperatorXPoint>
                chartId={`operatorx-${selectedOperator}`}
                testId="operatorx-chart"
                data={plotted}
                height={440}
                margin={{ top: 20, right: 20, bottom: 60, left: 75 }}
                watermark="logo"
                xScale={{ type: 'log', domain: [minX, maxX * 1.1] }}
                yScale={{ type: 'linear', domain: [0, maxY * 1.08] }}
                xAxis={{
                  label: isMoe ? t.tokensAxis : isAttention ? t.batchAxis : t.xAxis,
                  tickCount: 7,
                }}
                yAxis={{ label: metric === 'tflops' ? t.tflops : t.latency, tickCount: 5 }}
                layers={[
                  {
                    type: 'point',
                    data: plotted,
                    config: {
                      getCx: () => 0,
                      getCy: () => 0,
                      getX: x,
                      getY: y,
                      getColor: (p) => colors[pointDtype(p)] ?? '#888',
                      getRadius: () => 3.5,
                      keyFn: (p) => p.id,
                      maxPoints: Infinity,
                    },
                  },
                ]}
                zoom={{ enabled: true, axes: 'both', scaleExtent: [1, 20] }}
                instructions={t.instructions}
                tooltip={{
                  rulerType: 'crosshair',
                  attachToLayer: 0,
                  content: (p) =>
                    `<div class="rounded border bg-background p-3 text-sm">${escapeHtml(shape(p, true))}<br/>${format(p.tflops)} TFLOPS / GPU<br/>${format(p.latency_us)} µs</div>`,
                }}
              />
            ) : (
              <p className="py-16 text-center text-muted-foreground">{t.noPoints}</p>
            )}
            <p className="text-muted-foreground mt-4 text-sm">
              {isMoe ? t.moeMethod : isAttention ? t.attentionMethod : t.method}
            </p>
          </Card>
          <Card className="p-5">
            <Heading as="h2">
              {t.results} ({filtered.length.toLocaleString('en-US')})
            </Heading>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="operatorx-results">
                <thead>
                  <tr className="border-b">
                    {[
                      isMoe ? t.moeShape : isAttention ? t.attentionShape : 'M × N × K',
                      precisionLabel,
                      t.backend,
                      t.tflops,
                      t.latency,
                      t.status,
                      t.details,
                    ].map((label) => (
                      <th className="px-3 py-2 whitespace-nowrap" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(displayedPage * 100, (displayedPage + 1) * 100).map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="px-3 py-2 whitespace-nowrap font-mono">{shape(p, true)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{precision(p)}</td>
                      <td className="px-3 py-2">{p.backend}</td>
                      <td className="px-3 py-2 tabular-nums">{format(p.tflops)}</td>
                      <td className="px-3 py-2 tabular-nums">{format(p.latency_us)}</td>
                      <td className="px-3 py-2">{t[p.status]}</td>
                      <td className="max-w-sm px-3 py-2">
                        {(p.message || p.attention || p.moe) && (
                          <details>
                            <summary
                              className="cursor-pointer"
                              onClick={() => track('operatorx_case_details', { id: p.id })}
                            >
                              {t.details}
                            </summary>
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">
                              {p.message ?? JSON.stringify(p.args, null, 2)}
                            </pre>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && <p className="py-4">{t.noRows}</p>}
            <div className="mt-4 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                disabled={displayedPage === 0}
                onClick={() => {
                  setPage(displayedPage - 1);
                  track('operatorx_page_changed');
                }}
              >
                {t.previous}
              </Button>
              <span>
                {t.page} {displayedPage + 1} / {Math.max(1, Math.ceil(filtered.length / 100))}
              </span>
              <Button
                variant="outline"
                disabled={(displayedPage + 1) * 100 >= filtered.length}
                onClick={() => {
                  setPage(displayedPage + 1);
                  track('operatorx_page_changed');
                }}
              >
                {t.next}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
