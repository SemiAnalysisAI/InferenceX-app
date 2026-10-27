'use client';

import { useMemo } from 'react';

import { track } from '@/lib/analytics/analytics';
import {
  buildRunConfig,
  decodeRunConfig,
  disabledTopologyReason,
  encodeRunConfig,
  INFERENCEX_CONFIGS_URL,
  RUN_PLATFORMS,
  RUN_STRICTNESS,
  RUN_TOPOLOGIES,
  RUN_WORKLOADS,
  type RunConfigNote,
  type RunConfigSelection,
  type RunPlatform,
  type RunStrictness,
  type RunTopology,
  type RunWorkload,
} from '@/lib/powerx/run-config';

import { Chips, CopyButton, useWidgetHash, WidgetFrame, type WidgetProps } from './widget-chrome';

const STRINGS = {
  en: {
    platform: 'Platform',
    platforms: { hgx: 'NVIDIA HGX', nvl72: 'NVIDIA NVL72', amd: 'AMD' },
    platformTitles: {
      hgx: 'H100, H200, B200, B300: dcgm-exporter',
      nvl72: 'GB200, GB300: dcgm-exporter per compute tray',
      amd: 'MI300X, MI325X, MI355X: device-metrics-exporter',
    },
    topology: 'Topology',
    topologies: { single: 'Single node', multi: 'Multi-node' },
    topologyTitles: {
      single: "The cluster's native exporter; nothing to add to the matrix",
      multi: 'power: true merges the DCGM telemetry recipe',
    },
    amdMulti:
      'Multi-node AMD power is not collected yet: no AMD cluster is registered as a power lane and amd-master.yaml sets no power: true.',
    more: 'More options',
    workload: 'Workload',
    workloads: { fixed: 'Fixed sequence', agentx: 'AgentX' },
    strictness: 'Strictness',
    strictnessOptions: { 'best-effort': 'Best effort', require: 'Require power' },
    strictnessTitles: {
      'best-effort': 'An invalid window records power_valid: 0 and the run still passes',
      require: 'require-power fails the point on an invalid window',
    },
    copy: 'Copy YAML',
    notes: {
      'single-node':
        'Single-node rows inherit telemetry-native.yaml; power: true is rejected on them.',
      'nvl72-grace':
        'On NVL72 the Grace socket is measured when its window passes the Grace check.',
      'amd-exporter': 'AMD rows read device-metrics-exporter at 1 s; the metric is package power.',
      'agentx-lane': 'The multi-node AgentX lane must be registered as an AgentX power lane.',
    },
    reference: 'Field reference',
  },
  zh: {
    platform: '平台',
    platforms: { hgx: 'NVIDIA HGX', nvl72: 'NVIDIA NVL72', amd: 'AMD' },
    platformTitles: {
      hgx: 'H100、H200、B200、B300：dcgm-exporter',
      nvl72: 'GB200、GB300：每个计算托盘一个 dcgm-exporter',
      amd: 'MI300X、MI325X、MI355X：device-metrics-exporter',
    },
    topology: '拓扑',
    topologies: { single: '单节点', multi: '多节点' },
    topologyTitles: {
      single: '使用集群自带的 exporter，matrix 无需改动',
      multi: 'power: true 会合并 DCGM 遥测配置',
    },
    amdMulti:
      '多节点 AMD 功耗暂未采集：没有 AMD 集群登记为功耗 lane，amd-master.yaml 也没有设置 power: true。',
    more: '更多选项',
    workload: '工作负载',
    workloads: { fixed: '固定序列', agentx: 'AgentX' },
    strictness: '严格程度',
    strictnessOptions: { 'best-effort': '尽力而为', require: '要求功耗有效' },
    strictnessTitles: {
      'best-effort': '窗口无效时记录 power_valid: 0，运行照常通过',
      require: 'require-power 会让窗口无效的数据点直接失败',
    },
    copy: '复制 YAML',
    notes: {
      'single-node': '单节点条目继承 telemetry-native.yaml，不接受 power: true。',
      'nvl72-grace': 'NVL72 上窗口通过 Grace 校验时，Grace socket 为实测值。',
      'amd-exporter': 'AMD 条目以 1 s 读取 device-metrics-exporter，指标为封装功耗。',
      'agentx-lane': '多节点 AgentX lane 必须登记为 AgentX 功耗 lane。',
    },
    reference: '字段参考',
  },
} as const;

const HASH_KEY = 'rc';

export function RunConfigWidget({ locale, alt }: WidgetProps) {
  const t = STRINGS[locale];
  const [selection, setSelection] = useWidgetHash<RunConfigSelection>(
    HASH_KEY,
    encodeRunConfig,
    decodeRunConfig,
  );
  const config = useMemo(() => buildRunConfig(selection), [selection]);
  const update = (patch: Partial<RunConfigSelection>, event: string, value: string) => {
    setSelection({ ...selection, ...patch });
    track(`powerx_tutorial_run_config_${event}`, { value });
  };

  return (
    <WidgetFrame name="run-config" alt={alt}>
      <div className="grid gap-x-8 gap-y-3 sm:grid-cols-[auto_1fr]">
        <span className="pt-2 text-sm font-medium text-foreground sm:w-20">{t.platform}</span>
        <Chips<RunPlatform>
          label={t.platform}
          value={selection.platform}
          onChange={(platform) => update({ platform }, 'platform', platform)}
          options={RUN_PLATFORMS.map((key) => ({
            value: key,
            label: t.platforms[key],
            title: t.platformTitles[key],
          }))}
        />
        <span className="pt-2 text-sm font-medium text-foreground sm:w-20">{t.topology}</span>
        <Chips<RunTopology>
          label={t.topology}
          value={selection.topology}
          onChange={(topology) => update({ topology }, 'topology', topology)}
          options={RUN_TOPOLOGIES.map((key) => ({
            value: key,
            label: t.topologies[key],
            title: t.topologyTitles[key],
            disabled: disabledTopologyReason(selection.platform, key) ? t.amdMulti : null,
          }))}
        />
      </div>
      <details
        className="group mt-3 motion-details"
        onToggle={(event) => {
          if (event.currentTarget.open) track('powerx_tutorial_run_config_more_opened');
        }}
      >
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground md:min-h-9 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden="true"
            className="transition-transform duration-(--motion-dur-base) ease-[var(--motion-ease-standard)] group-open:rotate-45 motion-reduce:transition-none"
          >
            +
          </span>
          {t.more}
        </summary>
        <div className="mt-2 grid gap-x-8 gap-y-3 sm:grid-cols-[auto_1fr]">
          <span className="pt-2 text-sm font-medium text-foreground sm:w-20">{t.workload}</span>
          <Chips<RunWorkload>
            label={t.workload}
            value={selection.workload}
            onChange={(workload) => update({ workload }, 'workload', workload)}
            options={RUN_WORKLOADS.map((key) => ({ value: key, label: t.workloads[key] }))}
          />
          <span className="pt-2 text-sm font-medium text-foreground sm:w-20">{t.strictness}</span>
          <Chips<RunStrictness>
            label={t.strictness}
            value={selection.strictness}
            onChange={(strictness) => update({ strictness }, 'strictness', strictness)}
            options={RUN_STRICTNESS.map((key) => ({
              value: key,
              label: t.strictnessOptions[key],
              title: t.strictnessTitles[key],
            }))}
          />
        </div>
      </details>

      <div className="mt-4 overflow-hidden rounded-lg border border-border/60">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1">
          <span className="font-mono text-xs text-muted-foreground">{config.file}</span>
          <CopyButton
            text={config.yaml}
            label={t.copy}
            locale={locale}
            event="powerx_tutorial_run_config_copied"
          />
        </div>
        <pre
          data-testid="powerx-run-config-yaml"
          className="overflow-x-auto px-4 py-3 font-mono text-xs leading-5 text-foreground"
        >
          {config.yaml}
        </pre>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        <a
          href={INFERENCEX_CONFIGS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand hover:underline"
        >
          {t.reference}
        </a>
      </p>
      {config.notes.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm leading-6 text-muted-foreground">
          {config.notes.map((note: RunConfigNote) => (
            <li key={note}>{t.notes[note]}</li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}
