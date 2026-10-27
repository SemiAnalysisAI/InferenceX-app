'use client';

import { useMemo } from 'react';

import { track } from '@/lib/analytics/analytics';
import {
  BASIS_HARDWARE_GROUPS,
  BASIS_MAX_GRACE_WATTS,
  type BasisDeployment,
  type BasisGrace,
  type BasisHardware,
  type BasisSelection,
  type BasisWorkload,
  computeBasis,
  decodeBasis,
  defaultGpuWatts,
  encodeBasis,
  hardwareTdp,
  isRackHardware,
  POWER_MODEL_SHORT_REVISION,
  POWER_MODEL_SOURCE_URL,
} from '@/lib/powerx/power-basis';
import { cn } from '@/lib/shared/utils';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import {
  ChipRow,
  CopyButton,
  OutputBadge,
  OutputHeader,
  RangeRow,
  useWidgetHash,
  WidgetCard,
  WidgetNote,
  type WidgetProps,
} from './widget-chrome';

const STRINGS = {
  en: {
    hardware: 'Hardware',
    groups: { hopper: 'Hopper', blackwell: 'Blackwell', nvl72: 'NVL72', amd: 'AMD' },
    tdp: (watts: number) => `TDP ${watts} W`,
    workload: 'Workload',
    workloads: {
      fixed: { label: 'Fixed sequence', subtitle: '8k/1k, single_turn' },
      agentic: { label: 'Agentic', subtitle: 'AgentX, no KV offload' },
      'agentic-offload': { label: 'Agentic + KV offload', subtitle: 'host DRAM busy' },
    },
    deployment: 'Deployment',
    deployments: {
      single: { label: 'Single chassis', subtitle: 'scale-out NICs idle' },
      multi: { label: 'Multi-node', subtitle: 'scale-out NICs active' },
    },
    gpuPower: 'GPU power',
    gpuReadout: (watts: number, pct: number) => `${watts} W · ${pct.toFixed(0)} % of TDP`,
    gpuHint: 'default 60 % of TDP ≈ typical decode',
    grace: 'Grace socket',
    graces: {
      modeled: { label: 'Modeled', subtitle: 'CPU + LPDDR5X profile' },
      measured: { label: 'Measured', subtitle: 'per-socket watts from DCGM' },
    },
    graceWatts: 'W per socket',
    tiles: {
      gpu: 'GPU only',
      it: 'IT (no PUE)',
      facility: (pue: number) => `Facility (× PUE ${pue})`,
      allIn: 'All-in provisioned',
    },
    perGpu: 'W per GPU',
    measured: 'Measured',
    modeled: 'Modeled',
    rated: 'Rated',
    gpusPerMw: 'GPUs per MW of IT',
    percentOfTdp: '% of TDP',
    cooling: (mode: string, pue: number, count: number) =>
      `${mode === 'liquid' ? 'Liquid-cooled' : 'Air-cooled'} · PUE ${pue} · ${count} GPUs per ${count > 8 ? 'rack' : 'chassis'}`,
    component: 'Component',
    watts: 'W',
    share: '% of IT',
    outOfRange: "Outside the model's range",
    revision: (sha: string) => `power_model ${sha}`,
    revisionTitle: 'Pinned InferenceX power_model revision; open the source tree',
    copy: 'Copy breakdown',
    tileTitles: {
      gpu: 'The slider value: the only measured input',
      it: 'GPU plus every modeled component, before PUE',
      facility: 'IT × PUE for the cooling mode of this system',
      allIn: 'Vendor all-in provisioned W per GPU operators size racks with (HW_REGISTRY)',
    },
  },
  zh: {
    hardware: '硬件',
    groups: { hopper: 'Hopper', blackwell: 'Blackwell', nvl72: 'NVL72', amd: 'AMD' },
    tdp: (watts: number) => `TDP ${watts} W`,
    workload: '工作负载',
    workloads: {
      fixed: { label: '固定序列长度', subtitle: '8k/1k，single_turn' },
      agentic: { label: '智能体', subtitle: 'AgentX，无 KV offload' },
      'agentic-offload': { label: '智能体 + KV offload', subtitle: '主机 DRAM 繁忙' },
    },
    deployment: '部署方式',
    deployments: {
      single: { label: '单机箱', subtitle: 'scale-out NIC 空闲' },
      multi: { label: '多节点', subtitle: 'scale-out NIC 工作中' },
    },
    gpuPower: 'GPU 功耗',
    gpuReadout: (watts: number, pct: number) => `${watts} W · TDP 的 ${pct.toFixed(0)} %`,
    gpuHint: '默认取 TDP 的 60 %，接近典型 decode 点',
    grace: 'Grace socket',
    graces: {
      modeled: { label: '建模', subtitle: '按 CPU + LPDDR5X 模型估算' },
      measured: { label: '实测', subtitle: 'DCGM 上报的每 socket 瓦特数' },
    },
    graceWatts: 'W / socket',
    tiles: {
      gpu: 'GPU only',
      it: 'IT (no PUE)',
      facility: (pue: number) => `Facility（× PUE ${pue}）`,
      allIn: 'All-in provisioned',
    },
    perGpu: 'W / GPU',
    measured: '实测',
    modeled: '建模',
    rated: '标称',
    gpusPerMw: '每 MW IT 功率可部署的 GPU 数',
    percentOfTdp: 'TDP 占比',
    cooling: (mode: string, pue: number, count: number) =>
      `${mode === 'liquid' ? '液冷' : '风冷'} · PUE ${pue} · 每${count > 8 ? '机柜' : '机箱'} ${count} 颗 GPU`,
    component: '部件',
    watts: 'W',
    share: '占 IT 比例',
    outOfRange: '超出模型适用范围',
    revision: (sha: string) => `power_model ${sha}`,
    revisionTitle: '固定的 InferenceX power_model 版本；点击打开源码目录',
    copy: '复制明细',
    tileTitles: {
      gpu: '滑块的值：唯一的实测输入',
      it: 'GPU 加上所有建模部件，不含 PUE',
      facility: 'IT × 该系统散热方式对应的 PUE',
      allIn: '运营商规划机柜用的厂商全系统 provisioned 每 GPU 瓦特数（HW_REGISTRY）',
    },
  },
} as const;

const HASH_KEY = 'pb';
const WATTS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const ONE_DECIMAL = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export function PowerBasisWidget({ locale, alt }: WidgetProps) {
  const t = STRINGS[locale];
  const [selection, setSelection] = useWidgetHash<BasisSelection>(
    HASH_KEY,
    encodeBasis,
    decodeBasis,
  );
  const result = useMemo(() => computeBasis(selection), [selection]);
  const rack = isRackHardware(selection.hardware);
  const tdp = hardwareTdp(selection.hardware);

  function update(patch: Partial<BasisSelection>, action: string, value: string | number) {
    setSelection({ ...selection, ...patch });
    track(`powerx_tutorial_power_basis_${action}`, { value });
  }

  const copyText = result.ok
    ? [
        `${selection.hardware} ${selection.workload} ${selection.deployment} ${selection.gpuWatts} W/GPU`,
        `GPU only\t${WATTS.format(result.perGpu.gpu)} W/GPU`,
        `IT (no PUE)\t${WATTS.format(result.perGpu.it)} W/GPU`,
        `Facility (PUE ${result.pue})\t${WATTS.format(result.perGpu.facility)} W/GPU`,
        `All-in provisioned\t${WATTS.format(result.perGpu.allIn)} W/GPU`,
        `GPUs per MW (IT)\t${WATTS.format(result.gpusPerMw)}`,
        '',
        ...result.components.map(
          (component) =>
            `${component.name} x${component.quantity}\t${ONE_DECIMAL.format(component.watts)} W\t${(component.shareOfIt * 100).toFixed(1)} %\t${component.measured ? 'measured' : 'modeled'}`,
        ),
        '',
        `power_model ${POWER_MODEL_SHORT_REVISION}`,
      ].join('\n')
    : t.outOfRange;

  return (
    <WidgetCard name="power-basis" alt={alt}>
      <ChipRow<BasisHardware>
        label={t.hardware}
        value={selection.hardware}
        onChange={(hardware) =>
          update({ hardware, gpuWatts: defaultGpuWatts(hardware) }, 'hardware', hardware)
        }
        groups={BASIS_HARDWARE_GROUPS.map((group) => ({
          label: t.groups[group.key],
          options: group.hardware.map((hardware) => ({
            value: hardware,
            label: HW_REGISTRY[hardware].label,
            subtitle: t.tdp(HW_REGISTRY[hardware].tdp),
          })),
        }))}
      />
      <ChipRow<BasisWorkload>
        label={t.workload}
        value={selection.workload}
        onChange={(workload) => update({ workload }, 'workload', workload)}
        groups={[
          {
            options: (['fixed', 'agentic', 'agentic-offload'] as const).map((workload) => ({
              value: workload,
              ...t.workloads[workload],
            })),
          },
        ]}
      />
      <ChipRow<BasisDeployment>
        label={t.deployment}
        value={selection.deployment}
        onChange={(deployment) => update({ deployment }, 'deployment', deployment)}
        groups={[
          {
            options: (['single', 'multi'] as const).map((deployment) => ({
              value: deployment,
              ...t.deployments[deployment],
            })),
          },
        ]}
      />
      <RangeRow
        label={t.gpuPower}
        value={selection.gpuWatts}
        min={0}
        max={tdp}
        step={10}
        onChange={(gpuWatts) => update({ gpuWatts }, 'gpu_watts', gpuWatts)}
        readout={t.gpuReadout(selection.gpuWatts, (selection.gpuWatts / tdp) * 100)}
        hint={t.gpuHint}
      />
      {rack && (
        <ChipRow<BasisGrace>
          label={t.grace}
          value={selection.grace}
          onChange={(grace) => update({ grace }, 'grace', grace)}
          groups={[
            {
              options: (['modeled', 'measured'] as const).map((grace) => ({
                value: grace,
                ...t.graces[grace],
              })),
            },
          ]}
        >
          {selection.grace === 'measured' && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="number"
                min={0}
                max={BASIS_MAX_GRACE_WATTS}
                step={10}
                value={selection.graceWatts}
                aria-label={t.graceWatts}
                onChange={(event) =>
                  update(
                    {
                      graceWatts: Math.min(
                        BASIS_MAX_GRACE_WATTS,
                        Math.max(0, Number(event.target.value) || 0),
                      ),
                    },
                    'grace_watts',
                    event.target.value,
                  )
                }
                className="h-11 w-24 rounded-md border border-border bg-background px-2 font-mono text-sm text-foreground md:h-9"
              />
              {t.graceWatts}
            </label>
          )}
        </ChipRow>
      )}

      <OutputHeader>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <OutputBadge tone="measured">{t.measured}: GPU</OutputBadge>
          <OutputBadge tone="modeled">
            {t.modeled}: {t.tiles.it} · Facility
          </OutputBadge>
          <a
            href={POWER_MODEL_SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={t.revisionTitle}
            onClick={() => track('powerx_tutorial_power_basis_revision_opened')}
            className="font-mono text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
          >
            {t.revision(POWER_MODEL_SHORT_REVISION)}
          </a>
        </div>
        <CopyButton
          text={copyText}
          label={t.copy}
          locale={locale}
          event="powerx_tutorial_power_basis_copied"
        />
      </OutputHeader>

      {result.ok ? (
        <div className="space-y-4 px-4 py-4">
          <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {(
              [
                ['gpu', t.tiles.gpu, result.perGpu.gpu, 'measured', t.measured],
                ['it', t.tiles.it, result.perGpu.it, 'modeled', t.modeled],
                [
                  'facility',
                  t.tiles.facility(result.pue),
                  result.perGpu.facility,
                  'modeled',
                  t.modeled,
                ],
                ['allIn', t.tiles.allIn, result.perGpu.allIn, 'rated', t.rated],
              ] as const
            ).map(([key, label, watts, tone, badge]) => (
              <div
                key={key}
                title={t.tileTitles[key]}
                data-tile={key}
                className={cn(
                  'min-w-0 rounded-md border border-border/60 px-3 py-2',
                  key === 'it' && 'border-brand/60 bg-brand/5',
                )}
              >
                <dt className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="min-w-0">{label}</span>
                  <OutputBadge tone={tone}>{badge}</OutputBadge>
                </dt>
                <dd className="mt-1 font-mono text-lg tabular-nums text-foreground">
                  {WATTS.format(watts)}
                  <span className="ml-1 text-xs text-muted-foreground">{t.perGpu}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>
              <span className="font-mono text-sm tabular-nums text-foreground">
                {WATTS.format(result.gpusPerMw)}
              </span>{' '}
              {t.gpusPerMw}
            </span>
            <span>
              <span className="font-mono text-sm tabular-nums text-foreground">
                {ONE_DECIMAL.format(result.percentOfTdp)}
              </span>{' '}
              {t.percentOfTdp}
            </span>
            <span>{t.cooling(result.coolingMode, result.pue, result.gpuCount)}</span>
          </p>
          <div className="max-h-64 overflow-auto overscroll-contain rounded-md border border-border/60">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60 text-left text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 font-medium">{t.component}</th>
                  <th className="px-2 py-1 text-right font-medium">{t.watts}</th>
                  <th className="px-2 py-1 text-right font-medium">{t.share}</th>
                  <th className="px-2 py-1 font-medium" />
                </tr>
              </thead>
              <tbody>
                {result.components.map((component) => (
                  <tr key={component.name} className="border-t border-border/40">
                    <td className="px-2 py-1 text-foreground">
                      {component.name}
                      {component.quantity !== 1 && (
                        <span className="ml-1 text-muted-foreground">
                          ×{ONE_DECIMAL.format(component.quantity)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums">
                      {ONE_DECIMAL.format(component.watts)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums">
                      {(component.shareOfIt * 100).toFixed(1)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <OutputBadge tone={component.measured ? 'measured' : 'modeled'}>
                        {component.measured ? t.measured : t.modeled}
                      </OutputBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <WidgetNote>{t.outOfRange}</WidgetNote>
      )}
    </WidgetCard>
  );
}
