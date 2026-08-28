'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { BenchmarkSibling, BenchmarkSku } from '@/hooks/api/use-benchmark-siblings';
import {
  meaningfulParallelismSize,
  parallelismLabel,
} from '@/components/inference/utils/parallelism-label';
import { offloadTypeLabel } from '@/components/inference/utils/runtime-metadata-labels';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { track } from '@/lib/analytics';
import { isFrontierEligible, paretoFrontUpperLeft, paretoFrontUpperRight } from '@/lib/chart-utils';
import { isZhPathname, ZH_PREFIX } from '@/lib/i18n';

const HW_LABELS: Record<string, string> = {
  b200: 'B200',
  b300: 'B300',
  gb200: 'GB200',
  gb300: 'GB300',
  h100: 'H100',
  h200: 'H200',
  mi300x: 'MI300X',
  mi325x: 'MI325X',
  mi355x: 'MI355X',
};

const MODEL_LABELS: Record<string, string> = {
  dsr1: 'DeepSeek R1',
  dsv4: 'DeepSeek V4 Pro',
  glm5: 'GLM-5',
  'glm5.1': 'GLM-5.1',
  gptoss120b: 'gpt-oss 120B',
  kimik2: 'Kimi K2',
  'kimik2.5': 'Kimi K2.5',
  'kimik2.6': 'Kimi K2.6',
  llama70b: 'Llama 3.3 70B',
  'minimaxm2.5': 'MiniMax M2.5',
  'minimaxm2.7': 'MiniMax M2.7',
  'qwen3.5': 'Qwen 3.5',
};

function hwLabel(hw: string) {
  return HW_LABELS[hw] ?? hw.toUpperCase();
}
function modelLabel(m: string) {
  return MODEL_LABELS[m] ?? m;
}
function frameworkLabel(fw: string) {
  if (fw === 'vllm') return 'vLLM';
  if (fw === 'sglang') return 'SGLang';
  if (fw === 'trt') return 'TRT';
  if (fw === 'mori-sglang') return 'Mori-SGLang';
  if (fw.startsWith('dynamo-')) return `Dynamo ${fw.slice('dynamo-'.length).toUpperCase()}`;
  return fw;
}

function offloadTierLabel(s: BenchmarkSibling): string | null {
  const descriptor = s.kv_offloading?.trim();
  if (descriptor) {
    return descriptor.toLowerCase() === 'none' ? null : offloadTypeLabel(descriptor);
  }
  return s.offload_mode?.toLowerCase() === 'on' ? 'Offload' : null;
}

/** Short label for a sibling chip: parallelism + concurrency + physical KV tier. */
export function chipLabel(s: BenchmarkSibling): string {
  const usePrefill =
    !s.disagg &&
    (s.decode_tp <= 0 ||
      s.decode_ep <= 0 ||
      (s.decode_num_workers <= 0 &&
        s.num_decode_gpu <= 0 &&
        (s.prefill_num_workers > 0 || s.num_prefill_gpu > 0)));
  const aggregatePp =
    !s.disagg && (s.prefill_pp !== null || s.decode_pp !== null)
      ? Math.max(s.prefill_pp ?? 1, s.decode_pp ?? 1)
      : undefined;
  const aggregateDcp = s.disagg
    ? undefined
    : meaningfulParallelismSize(s.prefill_dcp_size, s.decode_dcp_size);
  const aggregatePcp = s.disagg
    ? undefined
    : meaningfulParallelismSize(s.prefill_pcp_size, s.decode_pcp_size);
  // Same parallelism labeler the chart points use (TP/EP/TEP/DEP/DPA…).
  const parallel = parallelismLabel({
    tp: usePrefill ? s.prefill_tp : s.decode_tp,
    ep: usePrefill ? s.prefill_ep : s.decode_ep,
    pp: s.disagg
      ? usePrefill
        ? (s.prefill_pp ?? undefined)
        : (s.decode_pp ?? undefined)
      : aggregatePp,
    dcp: s.disagg
      ? usePrefill
        ? (s.prefill_dcp_size ?? undefined)
        : (s.decode_dcp_size ?? undefined)
      : aggregateDcp,
    pcp: s.disagg
      ? usePrefill
        ? (s.prefill_pcp_size ?? undefined)
        : (s.decode_pcp_size ?? undefined)
      : aggregatePcp,
    dpAttention: usePrefill ? s.prefill_dp_attention : s.decode_dp_attention,
    disagg: s.disagg,
    isMultinode: s.is_multinode,
    prefillTp: s.prefill_tp,
    prefillEp: s.prefill_ep,
    prefillPp: s.prefill_pp ?? undefined,
    prefillDcp: s.prefill_dcp_size ?? undefined,
    prefillPcp: s.prefill_pcp_size ?? undefined,
    prefillDpAttention: s.prefill_dp_attention,
    prefillNumWorkers: s.prefill_num_workers,
    decodeTp: s.decode_tp,
    decodeEp: s.decode_ep,
    decodePp: s.decode_pp ?? undefined,
    decodeDcp: s.decode_dcp_size ?? undefined,
    decodePcp: s.decode_pcp_size ?? undefined,
    decodeDpAttention: s.decode_dp_attention,
    decodeNumWorkers: s.decode_num_workers,
  });
  const offload = offloadTierLabel(s);
  return `${parallel} • c=${s.conc}${offload ? ` • ${offload}` : ''}`;
}

interface SiblingParetoPoint {
  id: number;
  x: number;
  y: number;
}

const siblingParetoPoints = (
  siblings: BenchmarkSibling[],
  xMetric: 'p90_intvty' | 'p90_ttft',
): SiblingParetoPoint[] =>
  siblings
    .map((sibling) => ({
      id: sibling.id,
      x: sibling[xMetric] ?? Number.NaN,
      y: sibling.tput_per_gpu ?? Number.NaN,
    }))
    .filter((point) => isFrontierEligible(point) && Number.isFinite(point.y));

/**
 * Point IDs that lie on both P90 frontiers used by AgentX: interactivity vs.
 * throughput (upper-left in the reversed chart) and TTFT vs. throughput
 * (upper-right). The shared chart helpers keep tie behavior identical to the
 * plotted Pareto lines.
 */
export function dualParetoSiblingIds(siblings: BenchmarkSibling[]): Set<number> {
  const interactivity = new Set(
    paretoFrontUpperLeft(siblingParetoPoints(siblings, 'p90_intvty')).map((point) => point.id),
  );
  const ttft = new Set(
    paretoFrontUpperRight(siblingParetoPoints(siblings, 'p90_ttft')).map((point) => point.id),
  );
  return new Set([...interactivity].filter((id) => ttft.has(id)));
}

type SortMode = 'default' | 'conc' | 'parallelism' | 'tput' | 'requests';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'conc', label: 'Concurrency ↑' },
  { value: 'parallelism', label: 'Parallelism' },
  { value: 'tput', label: 'Throughput/Chip ↓' },
  { value: 'requests', label: 'Total requests ↓' },
];

// Group key for the "parallelism" sort: ep first (so TP/EP1 sorts ahead of
// EP/TEP/DEP groups), then tp, then dp-attention, then disagg — every config
// of one parallelism lands together, ordered by concurrency within.
const parallelRank = (
  s: BenchmarkSibling,
): [number, number, number, number, number, number, number] => {
  const usePrefill = !s.disagg && s.decode_tp <= 0 && s.prefill_tp > 0;
  return [
    usePrefill ? s.prefill_ep : s.decode_ep,
    usePrefill ? s.prefill_tp : s.decode_tp,
    (usePrefill ? s.prefill_pp : s.decode_pp) ?? 1,
    (usePrefill ? s.prefill_dcp_size : s.decode_dcp_size) ?? 1,
    (usePrefill ? s.prefill_pcp_size : s.decode_pcp_size) ?? 1,
    (usePrefill ? s.prefill_dp_attention : s.decode_dp_attention) ? 1 : 0,
    s.disagg ? 1 : 0,
  ];
};

function sortSiblings(siblings: BenchmarkSibling[], mode: SortMode): BenchmarkSibling[] {
  if (mode === 'default') return siblings;
  const out = [...siblings];
  if (mode === 'conc') {
    out.sort((a, b) => a.conc - b.conc);
  } else if (mode === 'tput') {
    // Highest throughput/GPU first; rows missing the metric sink to the end.
    out.sort((a, b) => (b.tput_per_gpu ?? -Infinity) - (a.tput_per_gpu ?? -Infinity));
  } else if (mode === 'requests') {
    // Most total requests first; rows missing the metric sink to the end.
    out.sort((a, b) => (b.total_requests ?? -Infinity) - (a.total_requests ?? -Infinity));
  } else {
    out.sort((a, b) => {
      const ra = parallelRank(a);
      const rb = parallelRank(b);
      for (let i = 0; i < ra.length; i++) {
        if (ra[i] !== rb[i]) return ra[i] - rb[i];
      }
      // Within a parallelism group: offload off before on, then concurrency.
      const oa = a.offload_mode === 'on' ? 1 : 0;
      const ob = b.offload_mode === 'on' ? 1 : 0;
      return oa - ob || a.conc - b.conc;
    });
  }
  return out;
}

const isSortMode = (v: string | null): v is SortMode =>
  v !== null && SORT_OPTIONS.some((o) => o.value === v);

export function SiblingNav({ sku, siblings }: { sku: BenchmarkSku; siblings: BenchmarkSibling[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const isZh = isZhPathname(pathname);
  const agenticBase = isZh ? `${ZH_PREFIX}/inference/agentic` : '/inference/agentic';
  // Persist the sort in the URL so clicking a point (which remounts this
  // component on the new route) keeps the chosen order instead of resetting.
  // Read it once from the URL on mount — this component only renders after the
  // client-side siblings query resolves, so `window` is always available here
  // (no SSR/hydration mismatch). Matches the app's window-based url-state read.
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    if (typeof window === 'undefined') return 'default';
    const v = new URLSearchParams(window.location.search).get('sort');
    return isSortMode(v) ? v : 'default';
  });

  const sorted = useMemo(() => sortSiblings(siblings, sortMode), [siblings, sortMode]);
  const dualParetoIds = useMemo(() => dualParetoSiblingIds(siblings), [siblings]);

  // prev/next follow the displayed (sorted) order so navigation matches the row.
  const currentIdx = sorted.findIndex((s) => s.is_current);
  const prev = currentIdx > 0 ? sorted[currentIdx - 1] : null;
  const next = currentIdx !== -1 && currentIdx < sorted.length - 1 ? sorted[currentIdx + 1] : null;

  // Carry the active sort through every point-to-point link.
  const hrefFor = (id: number) =>
    sortMode === 'default' ? `${agenticBase}/${id}` : `${agenticBase}/${id}?sort=${sortMode}`;

  const currentId = siblings.find((s) => s.is_current)?.id;

  const skuLabel = `${hwLabel(sku.hardware)} · ${modelLabel(sku.model)} · ${sku.precision.toUpperCase()} · ${frameworkLabel(sku.framework)}`;

  return (
    <div className="border-b border-border/40 pb-4 mb-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h1 className="text-2xl font-semibold text-foreground">{skuLabel}</h1>
        <span className="text-xs text-muted-foreground">
          {siblings.length} point{siblings.length === 1 ? '' : 's'} in this run · {sku.date}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Sort by</span>
          <Select
            value={sortMode}
            onValueChange={(v) => {
              const mode = v as SortMode;
              setSortMode(mode);
              track('agentic_siblings_sorted', { mode });
              // Mirror into the URL (replace, no history spam) so a refresh —
              // and the next point's mount — keep the chosen order.
              if (currentId !== undefined) {
                const href =
                  mode === 'default'
                    ? `${agenticBase}/${currentId}`
                    : `${agenticBase}/${currentId}?sort=${mode}`;
                router.replace(href, { scroll: false });
              }
            }}
          >
            <SelectTrigger
              className="h-7 w-[10rem] text-xs"
              aria-label="Sort points"
              data-testid="sibling-sort-select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          disabled={!prev}
          onClick={() => {
            if (prev) {
              track('agentic_siblings_navigated', { direction: 'prev', targetId: prev.id });
              router.push(hrefFor(prev.id));
            }
          }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-border/40 hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Previous point"
        >
          <ChevronLeft className="size-3.5" /> prev
        </button>
        <div className="flex items-center gap-1 flex-wrap">
          {sorted.map((s) => {
            const active = s.is_current;
            const isDualPareto = dualParetoIds.has(s.id);
            const title = [
              isDualPareto
                ? isZh
                  ? '同时位于 P90 交互性与 TTFT Pareto 前沿'
                  : 'On both P90 interactivity and TTFT Pareto frontiers'
                : null,
              s.has_trace ? null : isZh ? '无已存储的追踪数据' : 'No stored trace data',
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (!active) {
                    track('agentic_siblings_navigated', { direction: 'chip', targetId: s.id });
                    router.push(hrefFor(s.id));
                  }
                }}
                className={`px-2 py-1 rounded-md text-xs border transition-colors ${
                  active
                    ? 'border-primary bg-primary text-primary-foreground font-medium'
                    : 'border-border/40 text-foreground hover:bg-accent'
                } ${
                  isDualPareto ? 'ring-2 ring-primary/70 ring-offset-1 ring-offset-background' : ''
                } ${s.has_trace ? '' : 'opacity-60'}`}
                title={title || undefined}
                aria-label={`${chipLabel(s)}${
                  isDualPareto
                    ? isZh
                      ? '，同时位于两个 P90 Pareto 前沿'
                      : ', on both P90 Pareto frontiers'
                    : ''
                }`}
                data-dual-pareto={isDualPareto || undefined}
              >
                {chipLabel(s)}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={!next}
          onClick={() => {
            if (next) {
              track('agentic_siblings_navigated', { direction: 'next', targetId: next.id });
              router.push(hrefFor(next.id));
            }
          }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-border/40 hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next point"
        >
          next <ChevronRight className="size-3.5" />
        </button>
      </div>
      {dualParetoIds.size > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className="inline-block h-3 w-5 rounded-sm border border-border ring-2 ring-primary/70 ring-offset-1 ring-offset-background"
            aria-hidden="true"
          />
          <span>{isZh ? 'P90 交互性 + TTFT Pareto' : 'P90 interactivity + TTFT Pareto'}</span>
        </div>
      )}
    </div>
  );
}
