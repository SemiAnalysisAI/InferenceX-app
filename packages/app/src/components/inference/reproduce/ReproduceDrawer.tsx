'use client';

import { Check, Copy, ExternalLink, FileText } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import type { InferenceData } from '@/components/inference/types';
import { pointLogHref } from '@/components/inference/utils/tooltipUtils';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useReproduce } from '@/hooks/api/use-reproduce';
import { track } from '@/lib/analytics/analytics';
import { useDialogCloseTracking } from '@/lib/analytics/use-dialog-close-tracking';
import { isPersistedBenchmarkId } from '@/lib/benchmarks/benchmark-id';
import { getInferenceHardwareConfig } from '@/lib/benchmarks/inference-labels';
import { useLocale } from '@/lib/i18n/use-locale';
import { buildLaunchCommand, type LaunchCommand } from '@/lib/reproduce/launch-command';
import { buildReproduceConfig } from '@/lib/reproduce/reproduce-config';
import {
  buildReproduceEnvironment,
  type EnvironmentKey,
} from '@/lib/reproduce/reproduce-environment';
import { getDisplayLabel } from '@/lib/shared/utils';

export type ReproduceEntryPoint = 'scatter' | 'gpu_graph' | 'table';
type ReproduceTab = 'command' | 'config' | 'environment';

const STRINGS = {
  en: {
    title: 'Reproduce this result',
    description:
      'How this benchmark point was produced, from its stored configuration, run metadata, and logs.',
    unofficial: 'Unofficial run',
    tabs: { command: 'Command', config: 'Config JSON', environment: 'Environment' },
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: 'Could not copy. Select the text to copy it manually.',
    serverLog: 'Server log',
    run: 'Workflow run',
    loading: 'Loading launch record…',
    error: 'The launch record could not be loaded.',
    recorded: (file: string) =>
      `Exact environment and command for each process, as srtctl logged them in ${file}.`,
    engineArgs: (engine: string, file: string) =>
      `This run's logs record no launch command. These are the arguments ${engine} printed at startup in ${file}.`,
    noLogs: 'No logs are stored for this result, so its launch command is unknown.',
    notRecorded:
      'This framework did not log its launch command or arguments for this run. The Config JSON tab has the stored configuration.',
    configNote:
      'Stored configuration of this result, identical to the config /api/v1/reproduce returns.',
    overlay:
      'Launch logs are only stored for ingested results. The Config JSON and Environment tabs show what this unofficial run reported.',
    seeConfig: 'See Config JSON',
    notRecordedValue: 'Not recorded',
    environmentNote:
      'Values come from the stored result, its workflow run, and its logs. “Not recorded” means no stored artifact states the value.',
    rows: {
      gpu_sku: 'GPU SKU',
      container_image: 'Container image',
      launched_container: 'Launched container',
      framework: 'Framework',
      framework_commit: 'Framework commit (from image tag)',
      tensorrt_llm_version: 'TensorRT-LLM version',
      nccl_version: 'NCCL version',
      cuda_version: 'CUDA version (NCCL build)',
      driver_version: 'Driver version',
      router: 'Router',
      kv_offload_backend: 'KV offload backend',
      nodes: 'Nodes',
      gpus: 'GPUs',
      cpu: 'CPU',
      srtctl_version: 'srtctl version',
      recipe: 'srtctl recipe',
      inferencex_commit: 'InferenceX commit',
      workflow_run: 'Workflow run',
    } satisfies Record<EnvironmentKey, string>,
  },
  zh: {
    title: '复现该结果',
    description: '根据已存储的配置、运行元数据和日志，展示该基准测试数据点的产生方式。',
    unofficial: '非官方运行',
    tabs: { command: '命令', config: 'Config JSON', environment: '运行环境' },
    copy: '复制',
    copied: '已复制',
    copyFailed: '复制失败。请选中文本后手动复制。',
    serverLog: '服务器日志',
    run: '工作流运行',
    loading: '正在加载启动记录…',
    error: '无法加载启动记录。',
    recorded: (file: string) => `srtctl 在 ${file} 中记录的各进程完整环境变量和启动命令。`,
    engineArgs: (engine: string, file: string) =>
      `该运行的日志未记录启动命令。以下是 ${engine} 启动时在 ${file} 中输出的参数。`,
    noLogs: '该结果没有已存储的日志，因此无法得知其启动命令。',
    notRecorded: '该框架在本次运行中未输出启动命令或参数。已存储的配置见 Config JSON 标签页。',
    configNote: '该结果已存储的配置，与 /api/v1/reproduce 返回的 config 完全一致。',
    overlay:
      '只有已导入的结果才会存储启动日志。Config JSON 和运行环境标签页展示的是该非官方运行上报的信息。',
    seeConfig: '查看 Config JSON',
    notRecordedValue: '未记录',
    environmentNote:
      '数值来自已存储的结果、对应的工作流运行及其日志。“未记录”表示没有任何已存储的产物包含该值。',
    rows: {
      gpu_sku: 'GPU SKU',
      container_image: '容器镜像',
      launched_container: '实际启动的容器',
      framework: '框架',
      framework_commit: '框架 commit（取自镜像标签）',
      tensorrt_llm_version: 'TensorRT-LLM 版本',
      nccl_version: 'NCCL 版本',
      cuda_version: 'CUDA 版本（NCCL 构建）',
      driver_version: '驱动版本',
      router: 'Router',
      kv_offload_backend: 'KV offload 后端',
      nodes: '节点',
      gpus: 'GPU',
      cpu: 'CPU',
      srtctl_version: 'srtctl 版本',
      recipe: 'srtctl 配置方案',
      inferencex_commit: 'InferenceX commit',
      workflow_run: '工作流运行',
    } satisfies Record<EnvironmentKey, string>,
  },
} as const;

function CopyButton({ text, onCopied }: { text: string; onCopied: () => void }) {
  const t = STRINGS[useLocale()];
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      data-testid="reproduce-copy"
      title={status === 'failed' ? t.copyFailed : undefined}
      className={status === 'failed' ? 'border-destructive/30 text-destructive' : undefined}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setStatus('copied');
          onCopied();
        } catch {
          setStatus('failed');
        }
      }}
    >
      {status === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span aria-live="polite" className="sr-only sm:not-sr-only">
        {status === 'copied' ? t.copied : t.copy}
      </span>
    </Button>
  );
}

function CodeBlock({ children, label }: { children: string; label: string }) {
  return (
    <pre
      tabIndex={0}
      role="region"
      aria-label={label}
      className="overflow-auto whitespace-pre-wrap rounded-sm border border-border/50 bg-muted/30 p-3 font-mono text-xs leading-relaxed wrap-break-word focus-visible:outline-none"
    >
      {children}
    </pre>
  );
}

function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div
      className="flex flex-col items-center gap-3 py-8 text-center"
      data-testid="reproduce-command-fallback"
    >
      <p className="max-w-md text-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}

function commandText(command: LaunchCommand | null): string | null {
  if (!command) return null;
  if (command.kind === 'recorded') return command.script;
  if (command.kind === 'engine-args') return command.text;
  return null;
}

const TABS = ['command', 'config', 'environment'] as const;

interface Props {
  point: InferenceData | null;
  source: ReproduceEntryPoint;
  onClose: () => void;
}

export function ReproduceDrawer({ point, source, onClose }: Props) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const [tab, setTab] = useState<ReproduceTab>('command');
  const persistedId = point && isPersistedBenchmarkId(point.id) ? point.id : null;
  const { data: payload, isPending, isError } = useReproduce(persistedId, persistedId !== null);
  const open = point !== null;
  const framework = point?.framework ?? '';

  useDialogCloseTracking(open, 'inference_reproduce_closed', { source });
  useEffect(() => {
    if (!point) return;
    setTab('command');
    track('inference_reproduce_opened', {
      source,
      id: point.id,
      gpu: String(point.hwKey),
      framework: point.framework,
      overlay: !isPersistedBenchmarkId(point.id),
    });
  }, [point, source]);

  if (!point) return null;

  const hardwareLabel = getDisplayLabel(
    getInferenceHardwareConfig(String(point.hwKey), point.model, [point]),
  );
  const configText = JSON.stringify(buildReproduceConfig(point), null, 2);
  const environment = buildReproduceEnvironment(point, payload ?? null);
  const environmentText = JSON.stringify(
    Object.fromEntries(environment.map((row) => [row.key, row.value])),
    null,
    2,
  );
  const command =
    persistedId !== null && payload !== undefined
      ? buildLaunchCommand(payload?.logs ?? null)
      : null;
  const copyText: Record<ReproduceTab, string | null> = {
    command: commandText(command),
    config: configText,
    environment: environmentText,
  };
  const runUrl = payload?.run.run_url ?? point.run_url;
  const logHref =
    persistedId !== null && payload?.logs
      ? pointLogHref(persistedId, point.benchmark_type, locale)
      : null;
  const workload =
    point.benchmark_type === 'agentic_traces'
      ? 'AgentX'
      : point.isl && point.osl
        ? `ISL ${point.isl} · OSL ${point.osl}`
        : null;

  let commandBody: ReactNode;
  let commandNote: string | null = null;
  if (persistedId === null) {
    commandBody = <EmptyState>{t.overlay}</EmptyState>;
  } else if (isPending) {
    commandBody = <p className="py-8 text-center text-sm text-muted-foreground">{t.loading}</p>;
  } else if (isError) {
    commandBody = <p className="py-8 text-center text-sm text-destructive">{t.error}</p>;
  } else if (command?.kind === 'recorded' || command?.kind === 'engine-args') {
    commandNote =
      command.kind === 'recorded'
        ? t.recorded(command.file)
        : t.engineArgs(command.engine, command.file);
    commandBody = <CodeBlock label={t.tabs.command}>{copyText.command ?? ''}</CodeBlock>;
  } else {
    commandBody = (
      <EmptyState
        action={
          <Button type="button" variant="outline" size="xs" onClick={() => setTab('config')}>
            {t.seeConfig}
          </Button>
        }
      >
        {command?.kind === 'unavailable' && command.reason === 'no-logs' ? t.noLogs : t.notRecorded}
      </EmptyState>
    );
  }
  const footerNote: Record<ReproduceTab, string | null> = {
    command: commandNote,
    config: t.configNote,
    environment: t.environmentNote,
  };
  const activeCopy = copyText[tab];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        data-testid="reproduce-drawer"
        className="
          inset-x-0 bottom-0 top-auto left-auto translate-x-0 translate-y-0
          w-auto max-w-none h-[85vh] max-h-[85vh]
          rounded-none rounded-t-xl border-t border-l-0 p-0
          grid-rows-[auto_auto_1fr_auto] gap-0
          data-[state=open]:zoom-in-100! data-[state=closed]:zoom-out-100!
          data-[state=open]:slide-in-from-left-0! data-[state=open]:slide-in-from-bottom!
          data-[state=closed]:slide-out-to-left-0! data-[state=closed]:slide-out-to-bottom!
          sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:left-auto
          sm:w-[90vw] sm:max-w-4xl sm:h-screen sm:max-h-screen
          sm:rounded-none sm:border-l sm:border-t-0
          sm:data-[state=open]:slide-in-from-bottom-0! sm:data-[state=open]:slide-in-from-right!
          sm:data-[state=closed]:slide-out-to-bottom-0! sm:data-[state=closed]:slide-out-to-right!
        "
      >
        <div className="flex flex-col gap-3 border-b border-border px-4 pt-3 pb-4 pr-12 sm:flex-row sm:items-start sm:px-6 sm:pr-12">
          <div className="min-w-0 flex-1 pt-1">
            <DialogTitle className="text-base leading-snug">{t.title}</DialogTitle>
            <DialogDescription className="sr-only">{t.description}</DialogDescription>
            <p className="mt-2 break-words font-mono text-xs leading-relaxed text-muted-foreground">
              {[
                hardwareLabel,
                point.precision.toUpperCase(),
                `conc ${point.conc}`,
                persistedId === null ? t.unofficial : `#${persistedId}`,
              ].join(' · ')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
              {workload && <span className="font-medium text-foreground">{workload}</span>}
              <span>{point.actualDate ?? point.date}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:-mt-1.5 sm:justify-end md:mt-0">
            {logHref && (
              <Button asChild variant="outline" size="xs">
                <a
                  href={logHref}
                  data-testid="reproduce-server-log"
                  onClick={() =>
                    track('inference_reproduce_server_log_clicked', { framework, source })
                  }
                >
                  <FileText aria-hidden="true" />
                  {t.serverLog}
                </a>
              </Button>
            )}
            {runUrl && (
              <Button asChild variant="outline" size="xs">
                <a href={runUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden="true" />
                  {t.run}
                </a>
              </Button>
            )}
          </div>
        </div>
        <TabsPrimitive.Root
          value={tab}
          onValueChange={(value) => {
            setTab(value as ReproduceTab);
            track('inference_reproduce_tab_changed', { tab: value, framework, source });
          }}
          className="contents"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-3 sm:px-6">
            <TabsPrimitive.List aria-label={t.title} className="flex flex-wrap gap-2">
              {TABS.map((value) => (
                <TabsPrimitive.Trigger
                  key={value}
                  value={value}
                  data-testid={`reproduce-tab-${value}`}
                  className={buttonVariants({
                    variant: 'outline',
                    size: 'xs',
                    className:
                      'data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground dark:data-[state=active]:bg-input',
                  })}
                >
                  {t.tabs[value]}
                </TabsPrimitive.Trigger>
              ))}
            </TabsPrimitive.List>
            {activeCopy && (
              <div className="ml-auto">
                <CopyButton
                  key={tab}
                  text={activeCopy}
                  onCopied={() => track('inference_reproduce_copied', { tab, framework, source })}
                />
              </div>
            )}
          </div>
          <div className="min-h-0 overflow-auto px-4 py-4 sm:px-6">
            <TabsPrimitive.Content value="command" className="outline-none">
              {commandBody}
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="config" className="outline-none">
              <CodeBlock label={t.tabs.config}>{configText}</CodeBlock>
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="environment" className="outline-none">
              <dl className="divide-y divide-border/50 rounded-md border border-border/70 bg-card/30">
                {environment.map((row) => (
                  <div
                    key={row.key}
                    className="grid gap-1 px-3 py-2.5 sm:grid-cols-[13rem_1fr] sm:items-baseline sm:gap-4"
                    data-testid={`reproduce-env-${row.key}`}
                  >
                    <dt className="text-xs leading-relaxed font-medium text-muted-foreground">
                      {t.rows[row.key]}
                    </dt>
                    <dd className="min-w-0 font-mono text-xs leading-relaxed wrap-break-word">
                      {row.value === null ? (
                        <span className="font-sans text-muted-foreground">
                          {t.notRecordedValue}
                        </span>
                      ) : row.href ? (
                        <a
                          href={row.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-border underline-offset-2 hover:decoration-foreground"
                        >
                          {row.value}
                        </a>
                      ) : (
                        row.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </TabsPrimitive.Content>
          </div>
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-6">
            {footerNote[tab] ?? t.description}
          </div>
        </TabsPrimitive.Root>
      </DialogContent>
    </Dialog>
  );
}
