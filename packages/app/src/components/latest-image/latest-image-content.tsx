'use client';

import { useMemo, useState } from 'react';

import { DB_MODEL_TO_DISPLAY, islOslToSequence } from '@semianalysisai/inferencex-constants';

import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
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

/** Map framework variants to their base framework for release lookup. */
const FRAMEWORK_TO_BASE: Record<string, string> = {
  vllm: 'vllm',
  sglang: 'sglang',
  'dynamo-sglang': 'sglang',
  'mori-sglang': 'sglang',
};

function deriveOptions(data: LatestImageRow[]) {
  const models = new Set<string>();
  const precisions = new Set<string>();
  const sequences = new Set<string>();
  const specMethods = new Set<string>();

  for (const row of data) {
    const displayModel = DB_MODEL_TO_DISPLAY[row.model] ?? row.model;
    models.add(displayModel);
    precisions.add(row.precision);
    const seq = islOslToSequence(row.isl, row.osl) ?? `${row.isl}/${row.osl}`;
    sequences.add(seq);
    specMethods.add(row.spec_method);
  }

  return {
    models: [...models].sort(),
    precisions: [...precisions].sort(),
    sequences: [...sequences].filter((s) => s !== '1k/8k').sort(),
    specMethods: [...specMethods].sort(),
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
  const [selectedSpecMethod, setSelectedSpecMethod] = useState<string>('none');

  const options = useMemo(() => (data ? deriveOptions(data) : null), [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((row) => {
      if (selectedModel !== 'all') {
        const displayModel = DB_MODEL_TO_DISPLAY[row.model] ?? row.model;
        if (displayModel !== selectedModel) return false;
      }
      if (selectedPrecision !== 'all') {
        if (row.precision !== selectedPrecision) return false;
      }
      const seq = islOslToSequence(row.isl, row.osl) ?? `${row.isl}/${row.osl}`;
      if (seq !== selectedSequence) return false;
      if (row.spec_method !== selectedSpecMethod) return false;
      return true;
    });
  }, [data, selectedModel, selectedPrecision, selectedSequence, selectedSpecMethod]);

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
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                  {options.specMethods.map((m) => (
                    <SelectItem key={m} value={m}>
                      {formatSpecMethod(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                <th className="px-4 py-3 text-left text-sm font-semibold">
                  Current InferenceX Image Tag
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Actual Latest Tag</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                const displayModel = DB_MODEL_TO_DISPLAY[row.model] ?? row.model;
                const gpuLabel = row.hardware.toUpperCase();
                const actualLatest = getActualLatestTag(row.framework, releases);
                const outdated = isOutdated(row.image, actualLatest);

                return (
                  <tr
                    key={`${row.model}-${row.hardware}-${row.isl}-${row.osl}-${row.spec_method}-${i}`}
                    className={`border-b border-border last:border-b-0 transition-colors ${
                      outdated ? 'bg-red-500/10 hover:bg-red-500/15' : 'hover:bg-muted/30'
                    }`}
                  >
                    <td className="px-4 py-3 text-sm font-medium">{displayModel}</td>
                    <td className="px-4 py-3 text-sm uppercase">{row.precision}</td>
                    <td className="px-4 py-3 text-sm">{gpuLabel}</td>
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
