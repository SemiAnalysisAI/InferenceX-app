'use client';

import { ArrowDown, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { useMemo, useState } from 'react';

import type {
  ComparisonOp,
  ComparisonView,
  ComputePrecision,
} from '@semianalysisai/inferencex-db/operatorx/compare';
import { BLOCK_COLORS } from '@/components/inference/ui/model-architecture-diagram-renderer';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { RetryableQueryError } from '@/components/ui/retryable-query-error';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { prefetchOperatorXTimelines, useOperatorXModel } from '@/hooks/api/use-operatorx';
import { useClientSearch } from '@/hooks/useClientSearch';
import { replaceClientSearch } from '@/lib/client-navigation';
import { generateVendorColors } from '@/lib/dynamic-colors';

import { CaseDetail } from '../CaseDetail';
import { hardwareLabel, sortHardware } from '../compare/hardware';
import { METRICS, metricById } from '../compare/metrics';
import { buildModel, caseRefs, type ComparisonModel } from '../compare/model';
import { metricVsSize } from '../viz/metric-vs-size';
import { roofline } from '../viz/roofline';
import {
  architecture,
  type LayerBlock,
  modelLayers,
  type OpSlot,
  slotCases,
  subView,
} from './layers';
import { binTokens, gpuValues, inBin, OpBars, sizeBin } from './OpBars';

const DEFAULT_MODEL = 'DeepSeek-R1-0528';
const PRECISIONS: ComputePrecision[] = ['fp4', 'fp8', 'bf16'];
const ROW_GRID = 'grid-cols-[minmax(11rem,18rem)_minmax(0,1fr)_4.5rem]';

function setParam(key: string, value: string) {
  const params = new URLSearchParams(window.location.search);
  params.set(key, value);
  replaceClientSearch(params);
}

function ControlGroup({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

/** A slot resolved against the data: its cases, and those at the selected size. */
interface SlotData {
  slot: OpSlot;
  block: LayerBlock;
  model: ComparisonModel | null;
  indices: number[];
  atSize: number[];
}

/** Default size: this many tokens, or the nearest size with data. */
const DEFAULT_TOKENS = 128;

const formatTokens = (t: number) =>
  t >= 10_000 ? `${Number((t / 1000).toPrecision(3))}k` : t.toLocaleString();

/** The token count every row shows, over the sizes any row has data at. */
function TokenSlider({
  bins,
  bin,
  onChange,
}: {
  bins: number[];
  bin: number;
  onChange: (bin: number) => void;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor="operatorx-model-tokens" className="flex items-baseline gap-2 text-xs">
        <span className="text-muted-foreground">Tokens</span>
        <span className="font-semibold tabular-nums">≈ {formatTokens(binTokens(bin))}</span>
      </label>
      <input
        id="operatorx-model-tokens"
        type="range"
        min={0}
        max={bins.length - 1}
        step={1}
        value={bins.indexOf(bin)}
        onChange={(e) => onChange(bins[Number(e.target.value)])}
        className="w-full accent-primary"
        data-testid="operatorx-model-tokens"
      />
      <div className="flex justify-between text-2xs text-muted-foreground tabular-nums">
        <span>{formatTokens(binTokens(bins[0]))}</span>
        <span>{formatTokens(binTokens(bins.at(-1)!))}</span>
      </div>
    </div>
  );
}

function SlotTooltip({ data, tokens }: { data: SlotData; tokens: number }) {
  const { model, atSize, slot, block } = data;
  if (!model) return null;
  const rows = gpuValues(model, atSize);
  return (
    <div className="space-y-1.5 text-xs">
      <div className="font-semibold">
        {slot.label} <span className="font-normal text-muted-foreground">· {block.label}</span>
      </div>
      <div className="text-muted-foreground">
        {atSize.length.toLocaleString()} {atSize.length === 1 ? 'shape' : 'shapes'} at ≈{' '}
        {formatTokens(tokens)} tokens · median {model.metric.label.toLowerCase()}
      </div>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.hardware} className="flex items-center gap-2 tabular-nums">
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: model.colors[r.hardware] }}
            />
            <span className="w-14">{hardwareLabel(r.hardware)}</span>
            <strong>{model.metric.format(r.value)}</strong>
            <span className="text-muted-foreground">{r.measured} measured</span>
          </li>
        ))}
      </ul>
      <div className="text-muted-foreground">Click for every shape and its kernel timeline</div>
    </div>
  );
}

function BlockRows({
  block,
  slots,
  tokens,
  isDark,
  onOpen,
}: {
  block: LayerBlock;
  slots: SlotData[];
  tokens: number;
  isDark: boolean;
  onOpen: (data: SlotData) => void;
}) {
  const c = BLOCK_COLORS[block.kind];
  return (
    <div className={`grid ${ROW_GRID} gap-x-4`} data-testid={`operatorx-model-block-${block.id}`}>
      <div
        className="rounded-lg border"
        style={{
          gridColumn: 1,
          gridRow: `1 / span ${slots.length + 1}`,
          background: isDark ? c.dark : c.light,
          borderColor: c.stroke,
        }}
      />
      <div
        className="z-0 flex items-baseline gap-2 px-3 pt-2 pb-1"
        style={{ gridColumn: 1, gridRow: 1 }}
      >
        <span className="text-sm font-semibold">{block.label}</span>
        {block.repeat && block.repeat > 1 && (
          <span className="text-xs text-muted-foreground tabular-nums">×{block.repeat}</span>
        )}
      </div>
      {slots.map((data, r) => {
        const values = data.model ? gpuValues(data.model, data.atSize) : [];
        const measured = data.indices.length > 0;
        const row = (
          <button
            type="button"
            disabled={!measured}
            onClick={() => onOpen(data)}
            className={`z-0 col-span-3 grid grid-cols-subgrid items-center rounded-md text-left ${measured ? 'cursor-pointer hover:bg-muted/60' : 'cursor-default'}`}
            style={{ gridColumn: '1 / -1', gridRow: r + 2 }}
            data-testid={`operatorx-model-slot-${data.slot.id}`}
          >
            <span
              className={`truncate px-3 py-1 font-mono text-xs ${measured ? '' : 'text-muted-foreground'}`}
            >
              {data.slot.label}
            </span>
            {values.length > 0 ? (
              <OpBars model={data.model!} values={values} />
            ) : (
              <span className="text-xs text-muted-foreground">
                {measured
                  ? 'No shapes at this size'
                  : data.slot.op
                    ? 'No results yet'
                    : 'Not measured'}
              </span>
            )}
            <span className="text-right text-xs text-muted-foreground tabular-nums">
              {data.atSize.length > 0 ? data.atSize.length.toLocaleString() : ''}
            </span>
          </button>
        );
        return measured ? (
          <TooltipRoot key={data.slot.id} delayDuration={150}>
            <TooltipTrigger asChild>{row}</TooltipTrigger>
            <TooltipContent side="top" align="center" className="w-80">
              <SlotTooltip data={data} tokens={tokens} />
            </TooltipContent>
          </TooltipRoot>
        ) : (
          <div key={data.slot.id} className="contents">
            {row}
          </div>
        );
      })}
    </div>
  );
}

/** Every shape of one slot: size sweep and roofline, each point opening its kernel timeline. */
function SlotDetail({
  data,
  modelName,
  onClose,
}: {
  data: SlotData | null;
  modelName: string;
  onClose: () => void;
}) {
  const [inspected, setInspected] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const sub = useMemo(() => {
    if (!data?.model) return null;
    const { model, indices, slot } = data;
    const view = subView(model.view, indices);
    const op = slot.op as ComparisonOp;
    return {
      op,
      model: buildModel(
        view,
        model.metric,
        { hardware: model.hardware, available: model.available, toggle: model.toggle },
        model.colors,
        null,
        {
          inspect: setInspected,
          preview: (i) =>
            prefetchOperatorXTimelines(
              queryClient,
              op,
              caseRefs(view, model.hardware, i).map((r) => r.ref),
            ),
        },
      ),
    };
  }, [data, queryClient]);
  return (
    <Dialog open={data !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[94vh] w-[min(96vw,72rem)] max-w-[min(96vw,72rem)] flex-col gap-4 overflow-y-auto p-4 sm:p-6"
        data-testid="operatorx-model-slot-detail"
      >
        {data && sub && (
          <>
            <DialogHeader>
              <DialogTitle className="font-mono">{data.slot.label}</DialogTitle>
              <DialogDescription>
                {data.block.label} · {modelName} · {data.indices.length.toLocaleString()} shapes
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">{metricVsSize.title}</h3>
                <metricVsSize.Component model={sub.model} />
              </section>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">{roofline.title}</h3>
                <roofline.Component model={sub.model} />
              </section>
            </div>
            <CaseDetail
              op={sub.op}
              view={sub.model.view}
              hardware={sub.model.hardware}
              colors={sub.model.colors}
              caseIndex={inspected}
              onClose={() => setInspected(null)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A model top down, each op beside a per-GPU sweep of its OperatorX results. */
export function ModelView() {
  const search = new URLSearchParams(useClientSearch());
  const metric = metricById(search.get('metric'));
  const requested = search.get('model') ?? DEFAULT_MODEL;
  const gemm = useOperatorXModel('gemm', requested);
  const moe = useOperatorXModel('moe', requested);
  const isDark = useTheme().resolvedTheme === 'dark';
  const [picked, setPicked] = useState<string[] | null>(null);
  const [pickedPrecision, setPrecision] = useState<ComputePrecision | null>(null);
  const [open, setOpen] = useState<SlotData | null>(null);
  const [pickedBin, setBin] = useState<number | null>(null);

  const views = useMemo(
    () => [gemm.data, moe.data].filter((v): v is ComparisonView => Boolean(v)),
    [gemm.data, moe.data],
  );
  const modelOptions = useMemo(() => [...new Set(views.flatMap((v) => v.modelOptions))], [views]);
  const available = useMemo(
    () => sortHardware([...new Set(views.flatMap((v) => Object.keys(v.measurements)))]),
    [views],
  );
  const colors = useMemo(
    () =>
      generateVendorColors(
        [...new Set(views.flatMap((v) => v.hardware.map((h) => h.id)))],
        isDark ? 'dark' : 'light',
      ),
    [views, isDark],
  );
  const hardware = picked ? available.filter((h) => picked.includes(h)) : available;
  const precisionCounts = useMemo(() => {
    const m = new Map<ComputePrecision, number>();
    for (const v of views)
      for (const c of v.cases) m.set(c.computePrecision, (m.get(c.computePrecision) ?? 0) + 1);
    return m;
  }, [views]);
  const precisions = PRECISIONS.filter((p) => precisionCounts.has(p));
  const precision =
    pickedPrecision && precisions.includes(pickedPrecision)
      ? pickedPrecision
      : (precisions.toSorted(
          (a, b) => (precisionCounts.get(b) ?? 0) - (precisionCounts.get(a) ?? 0),
        )[0] ?? null);

  const arch = architecture(requested);
  const blocks = useMemo(
    () => modelLayers(arch, gemm.data, requested, (moe.data?.cases.length ?? 0) > 0),
    [arch, gemm.data, moe.data, requested],
  );
  const models = useMemo(() => {
    const toggle = (hw: string) => {
      const next = hardware.includes(hw) ? hardware.filter((h) => h !== hw) : [...hardware, hw];
      if (next.length > 0) setPicked(next);
    };
    const build = (view: ComparisonView | undefined) =>
      view
        ? buildModel(view, metric, { hardware, available, toggle }, colors, null, {
            inspect: () => {},
            preview: () => {},
          })
        : null;
    return { gemm: build(gemm.data), moe: build(moe.data) };
  }, [gemm.data, moe.data, metric, hardware, available, colors]);
  const resolved = useMemo(
    () =>
      blocks.map((block) => ({
        block,
        slots: block.slots.map((slot) => {
          const model = slot.op ? models[slot.op] : null;
          return {
            slot,
            block,
            model,
            indices: slotCases(model?.view, slot, requested, precision),
          };
        }),
      })),
    [blocks, models, requested, precision],
  );
  const bins = useMemo(() => {
    const out = new Set<number>();
    for (const { slots } of resolved)
      for (const s of slots)
        for (const i of s.indices) {
          const x = s.model!.view.cases[i].x;
          if (x && x > 0) out.add(sizeBin(x));
        }
    return [...out].sort((a, b) => a - b);
  }, [resolved]);
  const bin =
    pickedBin !== null && bins.includes(pickedBin)
      ? pickedBin
      : (bins.toSorted(
          (a, b) => Math.abs(a - sizeBin(DEFAULT_TOKENS)) - Math.abs(b - sizeBin(DEFAULT_TOKENS)),
        )[0] ?? null);
  const slots = useMemo(
    () =>
      new Map(
        resolved.map((r) => [
          r.block.id,
          r.slots.map((s): SlotData => ({
            ...s,
            atSize: s.model && bin !== null ? inBin(s.model, s.indices, bin) : [],
          })),
        ]),
      ),
    [resolved, bin],
  );
  const tokens = bin === null ? DEFAULT_TOKENS : binTokens(bin);

  const error = gemm.error ?? moe.error;
  if (error)
    return (
      <RetryableQueryError
        message={error.message}
        analyticsEvent="operatorx_model_view_retry"
        onRetry={() => {
          void gemm.refetch();
          void moe.refetch();
        }}
        testId="operatorx-model-view-error"
      />
    );
  if (gemm.isLoading || moe.isLoading)
    return (
      <Card data-testid="operatorx-loading" className="min-h-80 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Loading results…</p>
      </Card>
    );
  if (modelOptions.length === 0)
    return (
      <Card className="py-6 text-center">
        <p className="text-sm text-muted-foreground">No results yet</p>
      </Card>
    );

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4" data-testid="operatorx-model-view">
        <Card className="relative z-10 py-4 md:py-5">
          <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            <ControlGroup label="Model" htmlFor="operatorx-model">
              <SearchableSelect
                triggerId="operatorx-model"
                value={requested}
                onValueChange={(v) => setParam('model', v)}
                groups={[{ label: '', options: modelOptions.map((m) => ({ value: m, label: m })) }]}
              />
            </ControlGroup>
            <ControlGroup label="Metric" htmlFor="operatorx-metric">
              <SearchableSelect
                triggerId="operatorx-metric"
                value={metric.id}
                onValueChange={(v) => setParam('metric', v)}
                searchable={false}
                groups={[
                  {
                    label: '',
                    options: METRICS.map((m) => ({ value: m.id, label: `${m.label} (${m.unit})` })),
                  },
                ]}
              />
            </ControlGroup>
            <ControlGroup label="GPUs" htmlFor="operatorx-hardware">
              <MultiSelect
                triggerId="operatorx-hardware"
                options={available.map((h) => ({ value: h, label: hardwareLabel(h) }))}
                value={hardware}
                onChange={setPicked}
                minSelections={1}
              />
            </ControlGroup>
            <ControlGroup label="Precision" htmlFor="operatorx-model-precision">
              {precision && (
                <SegmentedToggle
                  value={precision}
                  onValueChange={setPrecision}
                  ariaLabel="Compute precision"
                  options={precisions.map((p) => ({ value: p, label: p }))}
                />
              )}
            </ControlGroup>
          </div>
        </Card>
        <Card className="gap-3">
          <div
            className={`sticky top-14 z-20 -mx-2 grid ${ROW_GRID} items-end gap-x-4 rounded-md bg-card px-2 py-2`}
          >
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {hardware.map((hw) => (
                <span key={hw} className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ background: colors[hw] }}
                  />
                  {hardwareLabel(hw)}
                </span>
              ))}
            </div>
            {bin === null ? <div /> : <TokenSlider bins={bins} bin={bin} onChange={setBin} />}
            <div className="text-right text-xs text-muted-foreground">Shapes</div>
          </div>
          <div className="flex flex-col">
            {blocks.map((block, b) => (
              <div key={block.id}>
                {b > 0 && (
                  <div className={`grid ${ROW_GRID} gap-x-4`}>
                    <ArrowDown className="mx-auto my-1 size-3.5 text-muted-foreground" />
                  </div>
                )}
                <BlockRows
                  block={block}
                  slots={slots.get(block.id) ?? []}
                  tokens={tokens}
                  isDark={isDark}
                  onOpen={setOpen}
                />
              </div>
            ))}
          </div>
        </Card>
        <SlotDetail data={open} modelName={requested} onClose={() => setOpen(null)} />
      </div>
    </TooltipProvider>
  );
}
