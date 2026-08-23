'use client';

import { useMemo, useState } from 'react';

import { DB_MODEL_TO_DISPLAY, islOslToSequence } from '@semianalysisai/inferencex-constants';

import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { Button } from '@/components/ui/button';
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
import type { LatestImageRow } from '@/lib/api';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { getFrameworkLabel } from '@/lib/utils';
import {
  AGE_MAX_RED_DAYS,
  ageColorStyle,
  ageRowStyle,
  baseFramework,
  daysSince,
  getActualLatestTag,
  getCurrentImageNodeTypeTooltip,
  isOutdated,
} from './latest-image-utils';

const STRINGS = {
  en: {
    title: 'Current InferenceX Image',
    description: 'Docker image tags for each model and chip configuration.',
    loading: 'Loading...',
    error: 'Failed to load image data.',
    releaseError: 'Failed to load current framework release tags. Image rows remain available.',
    retry: 'Retry',
    noMatch: 'No image data matches the selected filters.',
    labelModel: 'Model',
    tooltipModel: 'Filter by language model.',
    labelPrecision: 'Precision',
    tooltipPrecision: 'Numerical precision used for model weights.',
    labelIslOsl: 'ISL / OSL',
    tooltipIslOsl: 'Input Sequence Length / Output Sequence Length in tokens.',
    labelSpecDecode: 'Spec Decode',
    tooltipSpecDecode: 'Speculative decoding method. MTP = Multi-Token Prediction.',
    labelGpuSku: 'Chip SKU',
    tooltipGpuSku: 'Filter by Chip model (e.g. H200, MI300X, B200).',
    labelNodeType: 'Node Type',
    labelFramework: 'Framework',
    tooltipFramework:
      'Filter by inference engine (sglang, vllm, TensorRT, atom). Disaggregated framework variants collapse into their base engine. Empty = all frameworks.',
    allModels: 'All Models',
    all: 'All',
    singleNode: 'Single Node',
    disagg: 'Disaggregated',
    allFrameworks: 'All frameworks',
    thModel: 'Model',
    thPrecision: 'Precision',
    thGpuSku: 'Chip SKU',
    thSpecDecode: 'Spec Decode',
    thCurrentTag: 'Current InferenceX Image Tag',
    thActualLatest: 'Actual Latest Tag',
    thDaysSince: 'Days Since Update',
    off: 'Off',
    lastSubmission: 'Last submission:',
    days: (count: number) => `${count}d`,
    ageClamp: (days: number) => ` (≥${days}d clamps to max red)`,
  },
  zh: {
    title: 'InferenceX 当前镜像',
    description: '各模型与芯片配置的 Docker 镜像标签。',
    loading: '加载中……',
    error: '无法加载镜像数据。',
    releaseError: '无法加载框架最新版本标签，但镜像记录仍可查看。',
    retry: '重试',
    noMatch: '当前筛选组合没有镜像记录，请调整一个或多个筛选条件。',
    labelModel: '模型',
    tooltipModel: '按语言模型筛选。',
    labelPrecision: '精度',
    tooltipPrecision: '模型权重使用的数值精度。',
    labelIslOsl: 'ISL / OSL',
    tooltipIslOsl: '输入序列长度 / 输出序列长度（token 数）。',
    labelSpecDecode: '投机解码',
    tooltipSpecDecode: '投机解码方式。MTP 指多 token 预测。',
    labelGpuSku: '芯片型号',
    tooltipGpuSku: '按芯片型号筛选（如 H200、MI300X、B200）。',
    labelNodeType: '节点类型',
    labelFramework: '框架',
    tooltipFramework:
      '按推理引擎筛选（sglang、vllm、TensorRT、atom）。分离式框架变体归入基础引擎；不选择框架时显示全部框架。',
    allModels: '全部模型',
    all: '全部',
    singleNode: '单节点',
    disagg: '分离式',
    allFrameworks: '全部框架',
    thModel: '模型',
    thPrecision: '精度',
    thGpuSku: '芯片型号',
    thSpecDecode: '投机解码',
    thCurrentTag: '当前 InferenceX 镜像标签',
    thActualLatest: '实际最新标签',
    thDaysSince: '距上次更新天数',
    off: '关闭',
    lastSubmission: '上次提交：',
    days: (count: number) => `${count} 天`,
    ageClamp: (days: number) => `（≥${days} 天时按最高红色等级显示）`,
  },
} as const;

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

function formatSpecMethod(method: string, offLabel: string) {
  return method === 'none' ? offLabel : method.toUpperCase();
}

export function CurrentImageContent() {
  const { data, isLoading, error, refetch: refetchImages } = useLatestImages();
  const {
    data: releases,
    error: releasesError,
    refetch: refetchReleases,
    isFetching: releasesFetching,
  } = useFrameworkReleases();
  const locale = useLocale();
  const t = STRINGS[locale];

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
        const disagg = row.disagg;
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
        <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-2 text-muted-foreground">{t.description}</p>
      </div>

      {isLoading && <div className="py-12 text-center text-muted-foreground">{t.loading}</div>}

      {error && (
        <div className="py-12 text-center" data-testid="current-image-error">
          <p className="mb-3 text-destructive">{t.error}</p>
          <Button
            variant="outline"
            onClick={() => {
              track('current_image_retry_clicked');
              void refetchImages();
            }}
          >
            {t.retry}
          </Button>
        </div>
      )}

      {data && releasesError && (
        <div
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
          data-testid="current-image-releases-error"
        >
          <p className="text-sm text-destructive">{t.releaseError}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={releasesFetching}
            onClick={() => {
              track('current_image_releases_retry_clicked');
              void refetchReleases();
            }}
          >
            {t.retry}
          </Button>
        </div>
      )}

      {options && (
        <TooltipProvider delayDuration={0}>
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
            <div className="flex flex-col space-y-1.5">
              <LabelWithTooltip
                htmlFor="image-model-select"
                label={t.labelModel}
                tooltip={t.tooltipModel}
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
                  <SelectItem value="all">{t.allModels}</SelectItem>
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
                label={t.labelPrecision}
                tooltip={t.tooltipPrecision}
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
                  <SelectItem value="all">{t.all}</SelectItem>
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
                label={t.labelIslOsl}
                tooltip={t.tooltipIslOsl}
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
                label={t.labelSpecDecode}
                tooltip={t.tooltipSpecDecode}
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
                  <SelectItem value="all">{t.all}</SelectItem>
                  {options.specMethods.map((m) => (
                    <SelectItem key={m} value={m}>
                      {formatSpecMethod(m, t.off)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col space-y-1.5">
              <LabelWithTooltip
                htmlFor="image-hardware-select"
                label={t.labelGpuSku}
                tooltip={t.tooltipGpuSku}
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
                  <SelectItem value="all">{t.all}</SelectItem>
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
                label={t.labelNodeType}
                tooltip={getCurrentImageNodeTypeTooltip(locale)}
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
                  <SelectItem value="single">{t.singleNode}</SelectItem>
                  <SelectItem value="disagg">{t.disagg}</SelectItem>
                  <SelectItem value="all">{t.all}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col space-y-1.5">
              <LabelWithTooltip
                htmlFor="image-framework-multiselect"
                label={t.labelFramework}
                tooltip={t.tooltipFramework}
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
                placeholder={t.allFrameworks}
              />
            </div>
          </div>
        </TooltipProvider>
      )}

      {data && filtered.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">{t.noMatch}</div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-semibold">{t.thModel}</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">{t.thPrecision}</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">{t.thGpuSku}</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">{t.thSpecDecode}</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">{t.thCurrentTag}</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">{t.thActualLatest}</th>
                <th className="px-4 py-3 text-left text-sm font-semibold whitespace-nowrap">
                  {t.thDaysSince}
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
                        <span className="text-muted-foreground">{t.off}</span>
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
                      title={`${t.lastSubmission} ${row.date}${ageDays >= AGE_MAX_RED_DAYS ? t.ageClamp(AGE_MAX_RED_DAYS) : ''}`}
                    >
                      {t.days(ageDays)}
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
