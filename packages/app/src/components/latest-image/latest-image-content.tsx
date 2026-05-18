'use client';

import { useMemo, useState } from 'react';

import { DB_MODEL_TO_DISPLAY, islOslToSequence } from '@semianalysisai/inferencex-constants';

import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useFrameworkReleases } from '@/hooks/api/use-framework-releases';
import { useLatestImages } from '@/hooks/api/use-latest-images';
import type { FrameworkReleases, LatestImageRow } from '@/lib/api';
import { track } from '@/lib/analytics';
import { getFrameworkLabel } from '@/lib/utils';

/** Map framework variants to their base framework for release lookup. */
const FRAMEWORK_TO_BASE: Record<string, string> = {
  vllm: 'vllm',
  sglang: 'sglang',
  'dynamo-sglang': 'sglang',
  'mori-sglang': 'sglang',
};

/**
 * Disaggregated frameworks pair a separate prefill/decode pool — identified by
 * `dynamo-*` (NVIDIA Dynamo) or `mori-*` (AMD Mori) prefix on the framework key.
 */
function isDisaggFramework(framework: string): boolean {
  return framework.startsWith('dynamo-') || framework.startsWith('mori-');
}

/**
 * Strip the disagg prefix to get the base engine ID. `dynamo-trt` → `trt`,
 * `mori-sglang` → `sglang`, plain `vllm` stays `vllm`. Used by the framework
 * multi-select so users pick engines (sglang / vllm / trt / atom) without
 * having to think about whether they're disagg variants.
 */
function baseFramework(framework: string): string {
  if (framework.startsWith('dynamo-')) return framework.slice('dynamo-'.length);
  if (framework.startsWith('mori-')) return framework.slice('mori-'.length);
  return framework;
}

type NodeType = 'single' | 'disagg' | 'all';

function deriveOptions(data: LatestImageRow[]) {
  const models = new Set<string>();
  const precisions = new Set<string>();
  const sequences = new Set<string>();
  const specMethods = new Set<string>();
  const hardwares = new Set<string>();
  const frameworks = new Set<string>();

  for (const row of data) {
    const displayModel = DB_MODEL_TO_DISPLAY[row.model] ?? row.model;
    models.add(displayModel);
    precisions.add(row.precision);
    const seq = islOslToSequence(row.isl, row.osl) ?? `${row.isl}/${row.osl}`;
    sequences.add(seq);
    specMethods.add(row.spec_method);
    hardwares.add(row.hardware);
    frameworks.add(baseFramework(row.framework));
  }

  return {
    models: [...models].toSorted(),
    precisions: [...precisions].toSorted(),
    sequences: [...sequences].filter((s) => s !== '1k/8k').toSorted(),
    specMethods: [...specMethods].toSorted(),
    hardwares: [...hardwares].toSorted(),
    frameworks: [...frameworks].toSorted(),
  };
}

function formatSpecMethod(method: string) {
  return method === 'none' ? 'Off' : method.toUpperCase();
}

function getActualLatestTag(framework: string, releases: FrameworkReleases | undefined) {
  if (!releases) return null;
  const base = FRAMEWORK_TO_BASE[framework];
  if (!base) return null;
  return releases[base] ?? null;
}

const UNSTABLE_PATTERNS = ['nightly', 'rocm/sgl-dev', 'sglang-rocm'];

/** Whole-day delta between today (UTC) and an ISO date string (YYYY-MM-DD). */
function daysSince(dateStr: string, today: Date): number {
  const submitted = new Date(`${dateStr}T00:00:00Z`).getTime();
  const ms = today.getTime() - submitted;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Age past which the cell is rendered at max red — anything older looks identical. */
const AGE_MAX_RED_DAYS = 60;

/**
 * Returns inline style for the Days-Since-Update cell so older rows scream
 * louder visually. Ramps from a subtle red at 1 day to deep red at 60 days
 * (then clamps); 0-day rows return `undefined` so the cell falls back to the
 * muted-foreground class.
 */
function ageColorStyle(days: number): React.CSSProperties | undefined {
  if (days < 1) return undefined;
  const t = Math.min(AGE_MAX_RED_DAYS, days) / AGE_MAX_RED_DAYS; // 0.017 … 1
  // Perceptually-uniform OKLCH ramp at hue 25 (red): lightness drops as
  // chroma rises, so the cell goes from light pink to saturated dark red.
  const L = 0.78 - 0.28 * t;
  const C = 0.12 + 0.12 * t;
  return { color: `oklch(${L.toFixed(3)} ${C.toFixed(3)} 25)` };
}

/**
 * Companion to `ageColorStyle` for the whole row's background tint — same
 * 1d → 60d ramp but expressed as a low-alpha fill so the row content stays
 * readable. 0-day rows return `undefined` so the row falls back to its
 * hover-only class background.
 */
function ageRowStyle(days: number): React.CSSProperties | undefined {
  if (days < 1) return undefined;
  const t = Math.min(AGE_MAX_RED_DAYS, days) / AGE_MAX_RED_DAYS;
  // Alpha tops out around 0.28 — enough that 60d+ rows are unmistakably
  // tinted without drowning out the text or competing with hover affordance.
  const alpha = (0.04 + 0.24 * t).toFixed(3);
  return { backgroundColor: `oklch(0.60 0.22 25 / ${alpha})` };
}

/** Check if the image tag is outdated or uses an unstable/dev image. */
function isOutdated(image: string, actualLatest: string | null): boolean {
  const lower = image.toLowerCase();
  if (UNSTABLE_PATTERNS.some((p) => lower.includes(p))) return true;
  if (!actualLatest) return false;
  return !image.includes(actualLatest);
}

export function CurrentImageContent() {
  const { data, isLoading, error } = useLatestImages();
  const { data: releases } = useFrameworkReleases();

  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [selectedPrecision, setSelectedPrecision] = useState<string>('all');
  const [selectedSequence, setSelectedSequence] = useState<string>('1k/1k');
  const [selectedSpecMethod, setSelectedSpecMethod] = useState<string>('all');
  const [selectedHardware, setSelectedHardware] = useState<string>('all');
  const [selectedNodeType, setSelectedNodeType] = useState<NodeType>('single');
  // Empty array = no framework filter (matches every row); any non-empty array
  // limits the table to rows whose base framework is in the set.
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([]);

  const options = useMemo(() => (data ? deriveOptions(data) : null), [data]);

  // Stable "today" per render — recomputed on each mount, which is fine for the
  // page's read-only display (no need to tick every minute).
  const today = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const rows = data.filter((row) => {
      if (selectedModel !== 'all') {
        const displayModel = DB_MODEL_TO_DISPLAY[row.model] ?? row.model;
        if (displayModel !== selectedModel) return false;
      }
      if (selectedPrecision !== 'all' && row.precision !== selectedPrecision) return false;
      const seq = islOslToSequence(row.isl, row.osl) ?? `${row.isl}/${row.osl}`;
      if (seq !== selectedSequence) return false;
      if (selectedSpecMethod !== 'all' && row.spec_method !== selectedSpecMethod) return false;
      if (selectedHardware !== 'all' && row.hardware !== selectedHardware) return false;
      if (selectedNodeType !== 'all') {
        const disagg = isDisaggFramework(row.framework);
        if (selectedNodeType === 'single' && disagg) return false;
        if (selectedNodeType === 'disagg' && !disagg) return false;
      }
      if (
        selectedFrameworks.length > 0 &&
        !selectedFrameworks.includes(baseFramework(row.framework))
      )
        return false;
      return true;
    });
    // Sort oldest-image first so the most stale entries surface at the top —
    // users primarily care about "what hasn't been refreshed in a while".
    return rows.toSorted((a, b) => a.date.localeCompare(b.date));
  }, [
    data,
    selectedModel,
    selectedPrecision,
    selectedSequence,
    selectedSpecMethod,
    selectedHardware,
    selectedNodeType,
    selectedFrameworks,
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Current InferenceX Image</h1>
        <p className="mt-2 text-muted-foreground">
          Docker image tags for each model and GPU configuration.
        </p>
      </div>

      {isLoading && <div className="py-12 text-center text-muted-foreground">Loading...</div>}

      {error && (
        <div className="py-12 text-center text-destructive">Failed to load image data.</div>
      )}

      {options && (
        <TooltipProvider delayDuration={0}>
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
            <div className="flex flex-col space-y-1.5">
              <LabelWithTooltip
                htmlFor="image-model-select"
                label="Model"
                tooltip="Filter by language model."
              />
              <Select
                value={selectedModel}
                onValueChange={(v) => {
                  track('current_image_model_changed', { model: v });
                  setSelectedModel(v);
                }}
              >
                <SelectTrigger id="image-model-select" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Models</SelectItem>
                  {options.models.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col space-y-1.5">
              <LabelWithTooltip
                htmlFor="image-precision-select"
                label="Precision"
                tooltip="Numerical precision used for model weights."
              />
              <Select
                value={selectedPrecision}
                onValueChange={(v) => {
                  track('current_image_precision_changed', { precision: v });
                  setSelectedPrecision(v);
                }}
              >
                <SelectTrigger id="image-precision-select" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {options.precisions.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col space-y-1.5">
              <LabelWithTooltip
                htmlFor="image-sequence-select"
                label="ISL / OSL"
                tooltip="Input Sequence Length / Output Sequence Length in tokens."
              />
              <Select
                value={selectedSequence}
                onValueChange={(v) => {
                  track('current_image_sequence_changed', { sequence: v });
                  setSelectedSequence(v);
                }}
              >
                <SelectTrigger id="image-sequence-select" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.sequences.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col space-y-1.5">
              <LabelWithTooltip
                htmlFor="image-spec-decode-select"
                label="Spec Decode"
                tooltip="Speculative decoding method. MTP = Multi-Token Prediction."
              />
              <Select
                value={selectedSpecMethod}
                onValueChange={(v) => {
                  track('current_image_spec_decode_changed', { spec_decode: v });
                  setSelectedSpecMethod(v);
                }}
              >
                <SelectTrigger id="image-spec-decode-select" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {options.specMethods.map((m) => (
                    <SelectItem key={m} value={m}>
                      {formatSpecMethod(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col space-y-1.5">
              <LabelWithTooltip
                htmlFor="image-hardware-select"
                label="GPU SKU"
                tooltip="Filter by GPU model (e.g. H200, MI300X, B200)."
              />
              <Select
                value={selectedHardware}
                onValueChange={(v) => {
                  track('current_image_hardware_changed', { hardware: v });
                  setSelectedHardware(v);
                }}
              >
                <SelectTrigger id="image-hardware-select" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {options.hardwares.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col space-y-1.5">
              <LabelWithTooltip
                htmlFor="image-node-type-select"
                label="Node Type"
                tooltip="Single node = vLLM/SGLang/TRT. Disagg = NVIDIA Dynamo or AMD Mori with separate prefill/decode pools."
              />
              <Select
                value={selectedNodeType}
                onValueChange={(v) => {
                  track('current_image_node_type_changed', { node_type: v });
                  setSelectedNodeType(v as NodeType);
                }}
              >
                <SelectTrigger id="image-node-type-select" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single Node</SelectItem>
                  <SelectItem value="disagg">Disagg (Dynamo / Mori)</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col space-y-1.5">
              <LabelWithTooltip
                htmlFor="image-framework-multiselect"
                label="Framework"
                tooltip="Filter by inference engine (sglang, vllm, TensorRT, atom). Disagg variants (dynamo-*, mori-*) collapse into their base engine. Empty = all frameworks."
              />
              <MultiSelect
                triggerId="image-framework-multiselect"
                triggerTestId="image-framework-multiselect"
                options={options.frameworks.map((fw) => ({
                  value: fw,
                  label: getFrameworkLabel(fw),
                }))}
                value={selectedFrameworks}
                onChange={(v) => {
                  track('current_image_framework_changed', {
                    frameworks: v.join(',') || 'all',
                  });
                  setSelectedFrameworks(v);
                }}
                placeholder="All frameworks"
              />
            </div>
          </div>
        </TooltipProvider>
      )}

      {data && filtered.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          No image data matches the selected filters.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-semibold">Model</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Precision</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">GPU SKU</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Spec Decode</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">
                  Current InferenceX Image Tag
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Actual Latest Tag</th>
                <th
                  className="px-4 py-3 text-left text-sm font-semibold whitespace-nowrap"
                  title="Whole days between today and the most recent benchmark submission for this config"
                >
                  Days Since Update
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                const displayModel = DB_MODEL_TO_DISPLAY[row.model] ?? row.model;
                const gpuLabel = row.hardware.toUpperCase();
                const actualLatest = getActualLatestTag(row.framework, releases);
                const outdated = isOutdated(row.image, actualLatest);
                const ageDays = daysSince(row.date, today);
                // Only tint by age when the row is actually outdated (image lags
                // upstream latest, or uses an unstable tag). Up-to-date configs
                // shouldn't look alarming just because a day passed.
                const ageStyle = outdated ? ageColorStyle(ageDays) : undefined;
                const rowStyle = outdated ? ageRowStyle(ageDays) : undefined;

                return (
                  <tr
                    key={`${row.model}-${row.hardware}-${row.isl}-${row.osl}-${row.spec_method}-${i}`}
                    className={`border-b border-border last:border-b-0 transition-colors ${
                      rowStyle ? 'hover:brightness-110' : 'hover:bg-muted/30'
                    }`}
                    style={rowStyle}
                  >
                    <td className="px-4 py-3 text-sm font-medium">{displayModel}</td>
                    <td className="px-4 py-3 text-sm uppercase">{row.precision}</td>
                    <td className="px-4 py-3 text-sm">{gpuLabel}</td>
                    <td className="px-4 py-3 text-sm">
                      {row.spec_method === 'none' ? (
                        <span className="text-muted-foreground">Off</span>
                      ) : (
                        <span className="uppercase">{row.spec_method}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <code
                        className={`rounded px-1.5 py-0.5 font-mono text-xs ${
                          outdated ? 'bg-red-500/20 text-red-400' : 'bg-muted'
                        }`}
                      >
                        {row.image}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {actualLatest ? (
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {actualLatest}
                        </code>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 text-sm tabular-nums whitespace-nowrap ${
                        ageStyle ? 'font-medium' : 'text-muted-foreground'
                      }`}
                      style={ageStyle}
                      title={`Last submission: ${row.date}${ageDays >= AGE_MAX_RED_DAYS ? ` (≥${AGE_MAX_RED_DAYS}d clamps to max red)` : ''}`}
                    >
                      {ageDays}d
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
