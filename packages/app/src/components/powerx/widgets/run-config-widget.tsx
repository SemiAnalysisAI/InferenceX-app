'use client';

import { useMemo, useState } from 'react';

import { CopyableCodeBlock } from '@/components/ui/copyable-code-block';
import { track } from '@/lib/analytics/analytics';
import {
  buildRunConfig,
  decodeRunConfig,
  disabledTopologyReason,
  encodeRunConfig,
  INFERENCEX_CONFIGS_URL,
  normalizeRunConfig,
  type RunConfigNote,
  type RunConfigSelection,
  type RunPlatform,
  type RunStrictness,
  type RunTopology,
  type RunWorkload,
} from '@/lib/powerx/run-config';
import { cn } from '@/lib/shared/utils';

import {
  ChipRow,
  OutputBadge,
  OutputHeader,
  useWidgetHash,
  WidgetCard,
  WidgetNote,
  type WidgetProps,
} from './widget-chrome';

const TABS = ['yaml', 'workflow', 'result'] as const;
type Tab = (typeof TABS)[number];

const STRINGS = {
  en: {
    platform: 'Platform',
    platforms: {
      hgx: { label: 'NVIDIA HGX', subtitle: 'H100, H200, B200, B300' },
      nvl72: { label: 'NVIDIA NVL72', subtitle: 'GB200, GB300' },
      amd: { label: 'AMD OAM', subtitle: 'MI300X, MI325X, MI355X' },
    },
    topology: 'Topology',
    topologies: {
      single: { label: 'Single node', subtitle: 'native exporter, best effort' },
      multi: { label: 'Multi-node', subtitle: 'power: true on the row' },
    },
    amdMulti:
      'AMD multi-node power is not collected yet: no AMD cluster has a POWER_LANES rule and no amd-master.yaml entry sets power: true.',
    workload: 'Workload',
    workloads: {
      fixed: { label: 'Fixed sequence', subtitle: 'fixed-seq-len scenario' },
      agentx: { label: 'AgentX', subtitle: 'agentic-coding scenario' },
    },
    strictness: 'Strictness',
    strictnesses: {
      'best-effort': { label: 'Best effort', subtitle: 'invalid verdict, run passes' },
      require: { label: 'Require power', subtitle: 'job fails on invalid' },
    },
    tabs: { yaml: 'YAML', workflow: 'Workflow input', result: 'Result' },
    badge: (sha: string) => `Matches configs/CONFIGS.md @ ${sha}`,
    badgeTitle: 'Every line cites its InferenceX source file at this revision',
    notes: {
      'nvl72-grace': 'Grace socket power is measured when the window passes the Grace check.',
      'amd-exporter':
        "The cluster record's device-metrics-exporter block is used; no recipe change.",
      'agentx-lane': 'The lane rule must have agentx=True.',
    } satisfies Record<RunConfigNote, string>,
  },
  zh: {
    platform: '平台',
    platforms: {
      hgx: { label: 'NVIDIA HGX', subtitle: 'H100、H200、B200、B300' },
      nvl72: { label: 'NVIDIA NVL72', subtitle: 'GB200、GB300' },
      amd: { label: 'AMD OAM', subtitle: 'MI300X、MI325X、MI355X' },
    },
    topology: '拓扑',
    topologies: {
      single: { label: '单节点', subtitle: '集群自带 exporter，尽力采集' },
      multi: { label: '多节点', subtitle: '在该行设置 power: true' },
    },
    amdMulti:
      'AMD 多节点功耗尚未采集：没有任何 AMD 集群配置 POWER_LANES 规则，amd-master.yaml 中也没有条目设置 power: true。',
    workload: '工作负载',
    workloads: {
      fixed: { label: '固定序列长度', subtitle: 'fixed-seq-len 场景' },
      agentx: { label: 'AgentX', subtitle: 'agentic-coding 场景' },
    },
    strictness: '严格程度',
    strictnesses: {
      'best-effort': { label: '尽力采集', subtitle: '记录无效判定，任务照常通过' },
      require: { label: '强制采集', subtitle: '测量无效时任务失败' },
    },
    tabs: { yaml: 'YAML', workflow: 'Workflow 输入', result: '结果' },
    badge: (sha: string) => `与 configs/CONFIGS.md @ ${sha} 一致`,
    badgeTitle: '每一行都注明了该版本下的 InferenceX 源文件',
    notes: {
      'nvl72-grace': '窗口通过 Grace 校验时，Grace socket 功耗采用实测值。',
      'amd-exporter': '直接使用集群记录中的 device-metrics-exporter 配置块，无需修改测试配置。',
      'agentx-lane': 'lane 规则必须带有 agentx=True。',
    } satisfies Record<RunConfigNote, string>,
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
  const [tab, setTab] = useState<Tab>('yaml');
  const config = useMemo(() => buildRunConfig(selection), [selection]);

  function update(patch: Partial<RunConfigSelection>, action: string, value: string) {
    setSelection(normalizeRunConfig({ ...selection, ...patch }));
    track(`powerx_tutorial_run_config_${action}`, { value });
  }

  const body: Record<Tab, string> = {
    yaml: config.yaml,
    workflow: config.workflowInput,
    result: config.result,
  };

  return (
    <WidgetCard name="run-config" alt={alt}>
      <ChipRow<RunPlatform>
        label={t.platform}
        value={selection.platform}
        onChange={(platform) => update({ platform }, 'platform', platform)}
        groups={[
          {
            options: (['hgx', 'nvl72', 'amd'] as const).map((platform) => ({
              value: platform,
              ...t.platforms[platform],
            })),
          },
        ]}
      />
      <ChipRow<RunTopology>
        label={t.topology}
        value={selection.topology}
        onChange={(topology) => update({ topology }, 'topology', topology)}
        groups={[
          {
            options: (['single', 'multi'] as const).map((topology) => ({
              value: topology,
              ...t.topologies[topology],
              disabled: disabledTopologyReason(selection.platform, topology) ? t.amdMulti : null,
            })),
          },
        ]}
      />
      <ChipRow<RunWorkload>
        label={t.workload}
        value={selection.workload}
        onChange={(workload) => update({ workload }, 'workload', workload)}
        groups={[
          {
            options: (['fixed', 'agentx'] as const).map((workload) => ({
              value: workload,
              ...t.workloads[workload],
            })),
          },
        ]}
      />
      <ChipRow<RunStrictness>
        label={t.strictness}
        value={selection.strictness}
        onChange={(strictness) => update({ strictness }, 'strictness', strictness)}
        groups={[
          {
            options: (['best-effort', 'require'] as const).map((strictness) => ({
              value: strictness,
              ...t.strictnesses[strictness],
            })),
          },
        ]}
      />

      <OutputHeader>
        <div role="tablist" aria-label={t.tabs.yaml} className="flex flex-wrap gap-1">
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              onClick={() => {
                setTab(name);
                track('powerx_tutorial_run_config_tab', { value: name });
              }}
              className={cn(
                'inline-flex min-h-11 items-center rounded-md px-2.5 text-xs font-medium transition-colors md:min-h-8',
                tab === name
                  ? 'bg-brand text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {t.tabs[name]}
            </button>
          ))}
        </div>
        <a
          href={INFERENCEX_CONFIGS_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={t.badgeTitle}
          onClick={() => track('powerx_tutorial_run_config_source_opened')}
          className="hover:text-foreground"
        >
          <OutputBadge tone="verified">{t.badge(config.revision)}</OutputBadge>
        </a>
      </OutputHeader>
      <div className="p-3">
        <CopyableCodeBlock locale={locale} label={t.tabs[tab]}>
          {body[tab]}
        </CopyableCodeBlock>
      </div>
      {config.notes.map((note) => (
        <WidgetNote key={note}>{t.notes[note]}</WidgetNote>
      ))}
    </WidgetCard>
  );
}
