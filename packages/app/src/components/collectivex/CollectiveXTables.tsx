'use client';

import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { useLocale } from '@/lib/use-locale';

import { collectiveXTopologyLabel } from './data';

import type { CollectiveXAttempt, CollectiveXCoverage, CollectiveXOutcome } from './types';

const OUTCOME_CLASSES = {
  success: 'border-emerald-600/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  unsupported: 'border-zinc-500/40 bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
  failed: 'border-red-700/50 bg-red-700/15 text-red-800 dark:text-red-300',
  invalid: 'border-red-600/40 bg-red-500/15 text-red-700 dark:text-red-300',
  diagnostic: 'border-amber-600/40 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  pending: 'border-zinc-500/40 bg-zinc-500/5 text-muted-foreground',
} satisfies Record<CollectiveXOutcome, string>;

const STRINGS = {
  en: {
    outcome: {
      success: 'success',
      unsupported: 'unsupported',
      failed: 'failed',
      invalid: 'invalid',
      diagnostic: 'diagnostic',
      pending: 'pending',
    },
    phase: { decode: 'decode', prefill: 'prefill' },
    mode: { normal: 'Normal', 'low-latency': 'Low latency' },
    scope: { 'scale-up': 'Scale-up', 'scale-out': 'Scale-out' },
    disposition: { runnable: 'runnable', unsupported: 'unsupported' },
    case: 'Case',
    sku: 'SKU',
    backend: 'Backend',
    phaseHeader: 'Phase',
    modeHeader: 'Mode',
    epHeader: 'EP',
    scopeHeader: 'Fabric scope',
    topologyHeader: 'Topology',
    dispositionHeader: 'Disposition',
    outcomeHeader: 'Outcome',
    attempts: 'Attempts',
    selected: 'Selected',
    caseId: 'Case ID',
    attemptId: 'Attempt ID',
    failureMode: 'Failure mode',
    reason: 'Reason',
    terminalCoverage: 'Terminal coverage',
    allocation: 'Allocation',
    run: 'Run',
    attempt: 'Try',
    role: 'Role',
    terminalRole: 'terminal selection',
    allocationRole: 'allocation selection',
    retainedRole: 'retained',
    evidence: 'Evidence',
    retainedAttempts: 'Retained attempts',
  },
  zh: {
    outcome: {
      success: '成功',
      unsupported: '不支持',
      failed: '失败',
      invalid: '无效',
      diagnostic: '诊断',
      pending: '待运行',
    },
    phase: { decode: '解码', prefill: '预填充' },
    mode: { normal: '常规', 'low-latency': '低延迟' },
    scope: { 'scale-up': '域内（scale-up）', 'scale-out': '跨域（scale-out）' },
    disposition: { runnable: '可运行', unsupported: '不支持' },
    case: '用例',
    sku: 'SKU',
    backend: '后端',
    phaseHeader: '阶段',
    modeHeader: '模式',
    epHeader: 'EP',
    scopeHeader: '互联范围',
    topologyHeader: '拓扑',
    dispositionHeader: '计划状态',
    outcomeHeader: '结果',
    attempts: '尝试次数',
    selected: '已选尝试',
    caseId: '用例 ID',
    attemptId: '尝试 ID',
    failureMode: '失败类型',
    reason: '原因',
    terminalCoverage: '终结状态覆盖',
    allocation: '独立分配',
    run: '运行',
    attempt: '尝试序号',
    role: '用途',
    terminalRole: '终结状态选择',
    allocationRole: '独立分配选择',
    retainedRole: '保留',
    evidence: '证据数',
    retainedAttempts: '保留的全部尝试',
  },
} as const;

type TableStrings = (typeof STRINGS)[keyof typeof STRINGS];

const REASON_LABELS = {
  zh: {
    'artifact-validation-failed': '产物校验失败',
    'backend-platform-unsupported': '后端不支持该平台',
    'backend-token-capacity': '后端 token 容量不足',
    'launcher-setup-failed': '启动器初始化失败',
    'repository-staging-failed': '代码仓库暂存失败',
    'container-registry-verification-failed': '容器镜像仓库校验失败',
    'scheduler-allocation-failed': '调度资源分配失败',
    'container-image-preparation-failed': '容器镜像准备失败',
    'container-image-identity-failed': '容器镜像身份校验失败',
    'container-runtime-launch-failed': '容器运行时启动失败',
    'backend-setup-failed': '后端初始化失败',
    'artifact-collection-failed': '产物收集失败',
    'runtime-identity-mismatch': '运行时身份不匹配',
    'execution-timeout': '执行超时',
    'execution-deadlock': '执行死锁',
    'distributed-command-failed': '分布式命令执行失败',
    'post-emit-distributed-command-failed': '结果写出后的分布式命令失败',
    'unsupported-capability': '能力不支持',
    'execution-failed': '执行失败',
    'validation-failed': '校验失败',
    'diagnostic-evidence': '诊断证据',
    capability: '能力限制',
    setup: '初始化',
    'repository-stage': '代码仓库暂存',
    'registry-verification': '镜像仓库校验',
    'scheduler-allocation': '调度资源分配',
    'container-import': '容器镜像导入',
    'container-hash': '容器镜像哈希校验',
    'container-launch': '容器启动',
    'backend-setup': '后端初始化',
    'artifact-collection': '产物收集',
    'runtime-identity': '运行时身份',
    timeout: '超时',
    deadlock: '死锁',
    execution: '执行',
    'insufficient-allocations': '独立分配不足',
    'incomplete-repeat-coverage': '重复运行覆盖不完整',
    'correctness-failed': '正确性校验失败',
    'missing-measured-roundtrip-p99': '缺少实测往返 p99',
    'unstable-ordering': '排名顺序不稳定',
    'incomplete-provenance': '来源与运行溯源不完整',
    'noncanonical-workload': '工作负载不符合规范',
    'unresolved-anomaly': '异常尚未解释',
    'semantic-correctness-failed': '语义正确性校验失败',
    'measurement-nonconformant': '测量协议不符合要求',
    'expert-oracle-incomplete': '专家路由正确性校验不完整',
    'incomplete-aligned-repeats': '对齐的重复运行不完整',
    'missing-uniform-baseline': '缺少 uniform 基线',
    'incomplete-routing-anchors': '路由基准锚点不完整',
    'implementation-config-mismatch': '实现配置不一致',
    'unmatched-token-coverage': 'token 点位覆盖不一致',
    'awaiting-v1-runs': '等待 CollectiveX v1 运行结果',
  },
} as const;

export function collectiveXReasonLabel(value: string, locale: 'en' | 'zh'): string {
  if (locale === 'en') return value;
  return REASON_LABELS.zh[value as keyof typeof REASON_LABELS.zh] ?? value;
}

function attemptRoleLabel(
  attempt: CollectiveXAttempt,
  terminalAttemptIds: Set<string>,
  t: TableStrings,
): string {
  const roles = [
    ...(terminalAttemptIds.has(attempt.attempt_id) ? [t.terminalRole] : []),
    ...(attempt.selected ? [t.allocationRole] : []),
  ];
  return roles.length > 0 ? roles.join(' · ') : t.retainedRole;
}

function OutcomeBadge({ outcome }: { outcome: CollectiveXOutcome }) {
  const t = STRINGS[useLocale()];
  return (
    <Badge variant="outline" className={OUTCOME_CLASSES[outcome]}>
      {t.outcome[outcome]}
    </Badge>
  );
}

function shortId(value: string | null): string {
  if (value === null) return '-';
  const suffix = value.lastIndexOf('-');
  return suffix === -1 ? value : value.slice(suffix + 1).slice(-8);
}

export function CollectiveXCoverageTable({ coverage }: { coverage: CollectiveXCoverage[] }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const columns = useMemo<DataTableColumn<CollectiveXCoverage>[]>(
    () => [
      {
        header: t.case,
        cell: (row) => (
          <div title={`${t.caseId}: ${row.case_id}`}>
            <p className="font-medium whitespace-nowrap">{row.label}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{shortId(row.case_id)}</p>
          </div>
        ),
        sortValue: (row) => row.label,
      },
      {
        header: t.sku,
        cell: (row) => row.sku.toUpperCase(),
        sortValue: (row) => row.sku,
      },
      {
        header: t.backend,
        cell: (row) => row.backend,
        sortValue: (row) => row.backend,
      },
      {
        header: t.phaseHeader,
        cell: (row) => t.phase[row.phase],
        sortValue: (row) => t.phase[row.phase],
      },
      {
        header: t.modeHeader,
        cell: (row) => t.mode[row.mode],
        sortValue: (row) => t.mode[row.mode],
      },
      {
        header: t.epHeader,
        cell: (row) => `EP${row.topology.ep_size}`,
        sortValue: (row) => row.topology.ep_size,
      },
      {
        header: t.scopeHeader,
        cell: (row) => t.scope[row.topology.scope],
        sortValue: (row) => t.scope[row.topology.scope],
        className: 'whitespace-nowrap',
      },
      {
        header: t.topologyHeader,
        cell: (row) => collectiveXTopologyLabel(row.topology),
        sortValue: (row) => collectiveXTopologyLabel(row.topology),
        className: 'whitespace-nowrap',
      },
      {
        header: t.dispositionHeader,
        cell: (row) => t.disposition[row.disposition],
        sortValue: (row) => t.disposition[row.disposition],
      },
      {
        header: t.outcomeHeader,
        cell: (row) => <OutcomeBadge outcome={row.outcome} />,
        sortValue: (row) => t.outcome[row.outcome],
      },
      {
        header: t.attempts,
        align: 'right',
        cell: (row) => row.attempt_ids.length,
        sortValue: (row) => row.attempt_ids.length,
        className: 'tabular-nums',
      },
      {
        header: t.selected,
        cell: (row) => (
          <span title={row.selected_attempt_id ?? undefined} className="font-mono text-xs">
            {shortId(row.selected_attempt_id)}
          </span>
        ),
        sortValue: (row) => row.selected_attempt_id ?? '',
      },
      {
        header: t.failureMode,
        cell: (row) => (row.failure_mode ? collectiveXReasonLabel(row.failure_mode, locale) : '-'),
        sortValue: (row) =>
          row.failure_mode
            ? `${collectiveXReasonLabel(row.failure_mode, locale)} ${row.failure_mode}`
            : '',
      },
      {
        header: t.reason,
        cell: (row) => (row.reason ? collectiveXReasonLabel(row.reason, locale) : '-'),
        sortValue: (row) =>
          row.reason ? `${collectiveXReasonLabel(row.reason, locale)} ${row.reason}` : '',
      },
    ],
    [locale, t],
  );

  return (
    <Card data-testid="collectivex-coverage">
      <h2 className="text-lg font-semibold">{t.terminalCoverage}</h2>
      <DataTable
        data={coverage}
        columns={columns}
        testId="collectivex-coverage-table"
        analyticsPrefix="collectivex_coverage_table"
      />
    </Card>
  );
}

export function CollectiveXAttemptTable({
  attempts,
  coverage,
}: {
  attempts: CollectiveXAttempt[];
  coverage: CollectiveXCoverage[];
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const coverageByCase = useMemo(
    () => new Map(coverage.map((item) => [item.case_id, item])),
    [coverage],
  );
  const terminalAttemptIds = useMemo(
    () =>
      new Set(
        coverage.flatMap((item) =>
          item.selected_attempt_id === null ? [] : [item.selected_attempt_id],
        ),
      ),
    [coverage],
  );
  const columns = useMemo<DataTableColumn<CollectiveXAttempt>[]>(
    () => [
      {
        header: t.case,
        cell: (row) => (
          <div title={`${t.caseId}: ${row.case_id}`}>
            <p className="font-medium whitespace-nowrap">
              {coverageByCase.get(row.case_id)?.label ?? shortId(row.case_id)}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">{shortId(row.case_id)}</p>
          </div>
        ),
        sortValue: (row) => `${coverageByCase.get(row.case_id)?.label ?? ''} ${row.case_id}`,
      },
      {
        header: t.attemptId,
        cell: (row) => (
          <span title={row.attempt_id} className="font-mono text-xs">
            {shortId(row.attempt_id)}
          </span>
        ),
        sortValue: (row) => row.attempt_id,
      },
      {
        header: t.allocation,
        cell: (row) => (
          <span title={row.allocation_id} className="font-mono text-xs">
            {shortId(row.allocation_id)}
          </span>
        ),
        sortValue: (row) => row.allocation_id,
      },
      {
        header: t.run,
        cell: (row) => `${row.run_id}.${row.run_attempt}`,
        sortValue: (row) =>
          `${row.run_id.padStart(20, '0')}.${String(row.run_attempt).padStart(10, '0')}`,
        className: 'font-mono text-xs',
      },
      {
        header: t.attempt,
        align: 'right',
        cell: (row) => row.attempt_index,
        sortValue: (row) => row.attempt_index,
        className: 'tabular-nums',
      },
      {
        header: t.outcomeHeader,
        cell: (row) => <OutcomeBadge outcome={row.outcome} />,
        sortValue: (row) => t.outcome[row.outcome],
      },
      {
        header: t.role,
        cell: (row) => attemptRoleLabel(row, terminalAttemptIds, t),
        sortValue: (row) => attemptRoleLabel(row, terminalAttemptIds, t),
      },
      {
        header: t.evidence,
        align: 'right',
        cell: (row) => (
          <details className="font-mono text-xs">
            <summary
              aria-label={`${t.evidence}: ${row.evidence.length}`}
              title={row.evidence
                .map((item) => `${item.evidence_id} -> ${item.point_id}`)
                .join('\n')}
              className="cursor-pointer list-none whitespace-nowrap [&::-webkit-details-marker]:hidden"
            >
              {row.evidence.length}
              {row.evidence.length > 0 &&
                ` · ${row.evidence.map((item) => shortId(item.evidence_id)).join(' · ')}`}
            </summary>
            {row.evidence.length > 0 && (
              <div className="mt-2 max-w-[36rem] space-y-1 text-left text-[10px] leading-4 break-all">
                {row.evidence.map((item) => (
                  <p key={`${item.evidence_id}:${item.point_id}`}>
                    <span data-testid="collectivex-evidence-id">{item.evidence_id}</span>
                    <span aria-hidden="true"> -&gt; </span>
                    <span>{item.point_id}</span>
                  </p>
                ))}
              </div>
            )}
          </details>
        ),
        sortValue: (row) =>
          [
            String(row.evidence.length).padStart(8, '0'),
            ...row.evidence.flatMap((item) => [item.evidence_id, item.point_id]),
          ].join(' '),
        className: 'tabular-nums',
      },
      {
        header: t.failureMode,
        cell: (row) => (row.failure_mode ? collectiveXReasonLabel(row.failure_mode, locale) : '-'),
        sortValue: (row) =>
          row.failure_mode
            ? `${collectiveXReasonLabel(row.failure_mode, locale)} ${row.failure_mode}`
            : '',
      },
      {
        header: t.reason,
        cell: (row) => (row.reason ? collectiveXReasonLabel(row.reason, locale) : '-'),
        sortValue: (row) =>
          row.reason ? `${collectiveXReasonLabel(row.reason, locale)} ${row.reason}` : '',
      },
    ],
    [coverageByCase, locale, t, terminalAttemptIds],
  );

  return (
    <Card data-testid="collectivex-attempts">
      <h2 className="text-lg font-semibold">{t.retainedAttempts}</h2>
      <DataTable
        data={attempts}
        columns={columns}
        testId="collectivex-attempts-table"
        analyticsPrefix="collectivex_attempts_table"
      />
    </Card>
  );
}
