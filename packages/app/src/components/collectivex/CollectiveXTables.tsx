'use client';

import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { useLocale } from '@/lib/use-locale';

import {
  collectiveXSeriesLabel,
  collectiveXTopologyLabel,
  compareCollectiveXDecisionMetrics,
} from './data';

import type {
  CollectiveXAttempt,
  CollectiveXCohort,
  CollectiveXCoverage,
  CollectiveXDataset,
  CollectiveXMetric,
  CollectiveXOutcome,
  CollectiveXPublicationTier,
  CollectiveXRanking,
  CollectiveXRecommendation,
  CollectiveXSensitivity,
  CollectiveXSeries,
} from './types';

const OUTCOME_CLASSES = {
  success: 'border-emerald-600/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  unsupported: 'border-zinc-500/40 bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
  failed: 'border-red-700/50 bg-red-700/15 text-red-800 dark:text-red-300',
  invalid: 'border-red-600/40 bg-red-500/15 text-red-700 dark:text-red-300',
  diagnostic: 'border-amber-600/40 bg-amber-500/15 text-amber-700 dark:text-amber-300',
} satisfies Record<CollectiveXOutcome, string>;

const PUBLICATION_TIER_CLASSES = {
  official: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'comparable-experimental':
    'border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
} satisfies Record<CollectiveXPublicationTier, string>;

const STRINGS = {
  en: {
    outcome: {
      success: 'success',
      unsupported: 'unsupported',
      failed: 'failed',
      invalid: 'invalid',
      diagnostic: 'diagnostic',
    },
    tier: { official: 'Official', experimental: 'Experimental' },
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
    comparison: 'Comparison',
    metric: 'Metric',
    rank: 'Rank',
    tierHeader: 'Tier',
    configuration: 'Configuration',
    point: 'Point',
    value: 'Value',
    noControlledCohort: 'No controlled cohort is selected.',
    rankings: 'Rankings',
    allocations: 'allocations',
    comparisonContract: 'Comparison contract',
    controlledFactors: 'Held constant',
    varyingFactors: 'Compared',
    sampling: 'Sampling',
    warmups: 'Warmups',
    stableOrdering: 'Stable ordering',
    passed: 'passed',
    notPassed: 'not passed',
    samplingValue: (trials: number, iterations: number, samples: number) =>
      `${trials} trials × ${iterations} iterations = ${samples} samples per component`,
    warmupValue: (warmups: number) =>
      `${warmups} synchronized round-trip warmups before each measured component, trial, and point`,
    objective: 'Objective',
    recommendedConfiguration: 'Recommended configuration',
    basis: 'Basis',
    bestConfigurations: 'Best conforming configurations',
    contrast: 'Contrast',
    baseline: 'Baseline',
    candidate: 'Candidate',
    change: 'Change',
    routingSensitivity: 'Routing sensitivity',
    decision: {
      cohortKind: {
        library: 'Library contrast',
        chip: 'Platform contrast',
        system: 'System contrast',
        routing: 'Routing contrast',
      },
      reference: 'Reference',
      seriesUnit: 'series',
      recommendationObjective: {
        'min-p50-latency': 'lowest p50 latency',
        'min-p99-latency': 'lowest p99 latency',
        'max-payload-rate-at-p50-latency': 'highest payload rate at p50 latency',
        'max-payload-rate-at-p99-latency': 'highest payload rate at p99 latency',
      },
      rationale: 'Top stable measured roundtrip result in a controlled cohort',
      sensitivity: 'Routing sensitivity',
    },
  },
  zh: {
    outcome: {
      success: '成功',
      unsupported: '不支持',
      failed: '失败',
      invalid: '无效',
      diagnostic: '诊断',
    },
    tier: { official: '正式', experimental: '实验性' },
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
    comparison: '对比项',
    metric: '指标',
    rank: '排名',
    tierHeader: '发布级别',
    configuration: '配置',
    point: '点位',
    value: '数值',
    noControlledCohort: '尚未选择受控队列。',
    rankings: '排名',
    allocations: '次独立分配',
    comparisonContract: '对比协议',
    controlledFactors: '保持一致',
    varyingFactors: '对比变量',
    sampling: '采样',
    warmups: '预热',
    stableOrdering: '排名顺序稳定',
    passed: '已通过',
    notPassed: '未通过',
    samplingValue: (trials: number, iterations: number, samples: number) =>
      `${trials} 次试验 × ${iterations} 次迭代 = 每个分项 ${samples} 个样本`,
    warmupValue: (warmups: number) =>
      `每个测量分项、试验和点位前执行 ${warmups} 次同步完整往返预热`,
    objective: '目标',
    recommendedConfiguration: '推荐配置',
    basis: '依据',
    bestConfigurations: '符合条件的最佳配置',
    contrast: '对比',
    baseline: '基线',
    candidate: '候选项',
    change: '变化',
    routingSensitivity: '路由敏感性',
    decision: {
      cohortKind: {
        library: '通信库对比',
        chip: '平台对比',
        system: '参考系统对比',
        routing: '路由对比',
      },
      reference: '参考实现',
      seriesUnit: '个序列',
      recommendationObjective: {
        'min-p50-latency': 'p50 延迟最低',
        'min-p99-latency': 'p99 延迟最低',
        'max-payload-rate-at-p50-latency': 'p50 延迟分位点的逻辑载荷速率最高',
        'max-payload-rate-at-p99-latency': 'p99 延迟分位点的逻辑载荷速率最高',
      },
      rationale: '受控队列中排名第一的稳定实测往返结果',
      sensitivity: '路由敏感性',
    },
  },
} as const;

type TableStrings = (typeof STRINGS)[keyof typeof STRINGS];

const FACTOR_LABELS = {
  en: {
    backend: 'Backend implementation',
    source: 'Source revision',
    workload: 'Workload',
    mode: 'Mode',
    phase: 'Phase',
    measurement: 'Measurement contract',
    system: 'Realized system and topology',
    resource: 'Resource profile',
    'resource.mode': 'Resource tuning policy',
    'implementation-static-build': 'Static implementation build',
    'model-shape': 'Model shape',
    'workload.routing': 'Routing distribution',
    'workload.eplb': 'EPLB treatment',
    'implementation-config': 'Generated implementation config',
  },
  zh: {
    backend: '后端实现',
    source: '源代码版本',
    workload: '工作负载',
    mode: '模式',
    phase: '阶段',
    measurement: '测量协议',
    system: '实际系统与拓扑',
    resource: '资源配置',
    'resource.mode': '资源调优策略',
    'implementation-static-build': '静态实现构建',
    'model-shape': '模型形状',
    'workload.routing': '路由分布',
    'workload.eplb': 'EPLB 处理',
    'implementation-config': '生成的实现配置',
  },
} as const;

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

function factorLabel(value: string, locale: 'en' | 'zh'): string {
  return FACTOR_LABELS[locale][value as keyof (typeof FACTOR_LABELS)[typeof locale]] ?? value;
}

export function collectiveXReasonLabel(value: string, locale: 'en' | 'zh'): string {
  if (locale === 'en') return value;
  return REASON_LABELS.zh[value as keyof typeof REASON_LABELS.zh] ?? value;
}

function cohortDescription(cohort: CollectiveXCohort, locale: 'en' | 'zh'): string {
  if (locale === 'en') return cohort.description;
  if (
    cohort.kind === 'dispatch-precision' ||
    cohort.kind === 'combine-precision' ||
    cohort.kind === 'precision-pair'
  )
    return cohort.description;
  return {
    library: '在相同实际系统、工作负载与测量协议下对比通信库及其调优资源配置。',
    chip: '在相同后端谱系、工作负载与测量协议下对比完整平台系统。',
    system: '使用可移植 NCCL/RCCL 参考实现，在相同工作负载与测量协议下对比系统。',
    routing: '在相同实现、系统与资源配置下，对比路由分布及 EPLB 处理。',
  }[cohort.kind];
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

function PublicationTierBadge({ tier }: { tier: CollectiveXPublicationTier }) {
  const t = STRINGS[useLocale()];
  return (
    <Badge
      data-testid="collectivex-publication-tier"
      variant="outline"
      className={PUBLICATION_TIER_CLASSES[tier]}
    >
      {tier === 'official' ? t.tier.official : t.tier.experimental}
    </Badge>
  );
}

function shortId(value: string | null): string {
  if (value === null) return '-';
  const suffix = value.lastIndexOf('-');
  return suffix === -1 ? value : value.slice(suffix + 1).slice(-8);
}

function distinctSeriesValue(
  series: CollectiveXSeries[],
  getValue: (item: CollectiveXSeries) => string,
): string {
  return [...new Set(series.map(getValue))].join(' ↔ ') || '-';
}

function seriesContextColumns<T>(
  getSeries: (row: T) => CollectiveXSeries[],
  t: TableStrings,
): DataTableColumn<T>[] {
  const value = (row: T, getValue: (item: CollectiveXSeries) => string) =>
    distinctSeriesValue(getSeries(row), getValue);
  return [
    {
      header: t.modeHeader,
      cell: (row) => value(row, (item) => t.mode[item.mode]),
      sortValue: (row) => value(row, (item) => t.mode[item.mode]),
      className: 'whitespace-nowrap',
    },
    {
      header: t.epHeader,
      cell: (row) => value(row, (item) => `EP${item.system.ep_size}`),
      sortValue: (row) => value(row, (item) => `EP${item.system.ep_size}`),
      className: 'whitespace-nowrap',
    },
    {
      header: t.scopeHeader,
      cell: (row) => value(row, (item) => t.scope[item.system.scope]),
      sortValue: (row) => value(row, (item) => t.scope[item.system.scope]),
      className: 'whitespace-nowrap',
    },
    {
      header: t.topologyHeader,
      cell: (row) => value(row, (item) => collectiveXTopologyLabel(item.system)),
      sortValue: (row) => value(row, (item) => collectiveXTopologyLabel(item.system)),
      className: 'whitespace-nowrap',
    },
  ];
}

function decisionMetricName(metric: CollectiveXMetric, locale: 'en' | 'zh'): string {
  if (locale === 'zh' && metric.measure !== 'latency_us') {
    const rate =
      metric.measure === 'activation_data_rate_gbps_at_latency_percentile'
        ? 'activation-data rate'
        : 'total logical data rate';
    return `${rate} at ${metric.statistic} latency`;
  }
  if (locale === 'zh') {
    return metric.measure === 'latency_us'
      ? `${metric.statistic} 延迟`
      : `${metric.statistic} 延迟分位点对应的逻辑载荷速率`;
  }
  if (metric.measure === 'latency_us') return `${metric.statistic} latency`;
  const rate =
    metric.measure === 'activation_data_rate_gbps_at_latency_percentile'
      ? 'activation-data rate'
      : 'total logical data rate';
  return `${rate} at ${metric.statistic} latency`;
}

function metricLabel(ranking: CollectiveXRanking, locale: 'en' | 'zh'): string {
  const { metric } = ranking;
  if (locale === 'zh') {
    return `${STRINGS.zh.phase[metric.phase]} T=${metric.tokens_per_rank} 往返 ${decisionMetricName(metric, locale)}`;
  }
  const measure =
    metric.measure === 'latency_us'
      ? `${metric.statistic} latency`
      : decisionMetricName(metric, 'en');
  return `${metric.phase} T=${metric.tokens_per_rank} ${metric.operation} ${measure}`;
}

export function collectiveXCohortLabel(
  cohort: CollectiveXCohort,
  seriesById: Map<string, CollectiveXSeries>,
  locale: 'en' | 'zh',
): string {
  if (locale === 'en') return cohort.label;
  if (
    cohort.kind === 'dispatch-precision' ||
    cohort.kind === 'combine-precision' ||
    cohort.kind === 'precision-pair'
  )
    return cohort.label;
  const first = seriesById.get(cohort.series_ids[0]);
  if (!first) return cohort.label;
  const members = cohort.series_ids.flatMap((seriesId) => {
    const series = seriesById.get(seriesId);
    return series ? [series] : [];
  });
  const phase = STRINGS.zh.phase[first.phase];
  const mode = STRINGS.zh.mode[first.mode];
  const scope = [...new Set(members.map((item) => item.system.scope))]
    .map((item) => STRINGS.zh.scope[item])
    .join(' ↔ ');
  const routing = `${first.workload.routing}${first.workload.eplb ? '+EPLB' : ''}`;
  const ep = `EP${first.system.ep_size}`;
  const context = {
    library: `${first.system.sku.toUpperCase()} ${ep} / ${mode} / ${scope} / ${phase} / ${routing}`,
    chip: `${first.backend.label} ${ep} / ${mode} / ${scope} / ${phase} / ${routing}`,
    system: `${STRINGS.zh.decision.reference} ${ep} / ${mode} / ${scope} / ${phase} / ${routing}`,
    routing: `${first.system.sku.toUpperCase()} / ${first.backend.label} / ${ep} / ${mode} / ${scope} / ${phase}`,
  }[cohort.kind];
  return `${context} / ${STRINGS.zh.decision.cohortKind[cohort.kind]}（${cohort.series_ids.length} ${STRINGS.zh.decision.seriesUnit}）`;
}

function rankingLabel(
  ranking: CollectiveXRanking,
  cohort: CollectiveXCohort,
  locale: 'en' | 'zh',
): string {
  if (locale === 'en') return ranking.label;
  if (
    cohort.kind === 'dispatch-precision' ||
    cohort.kind === 'combine-precision' ||
    cohort.kind === 'precision-pair'
  )
    return ranking.label;
  return `${STRINGS.zh.decision.cohortKind[cohort.kind]} ${decisionMetricName(ranking.metric, locale)} T=${ranking.metric.tokens_per_rank}`;
}

function recommendationLabel(
  recommendation: CollectiveXRecommendation,
  seriesById: Map<string, CollectiveXSeries>,
  locale: 'en' | 'zh',
): string {
  if (locale === 'en') return recommendation.label;
  const point = seriesById
    .get(recommendation.series_id)
    ?.points.find((item) => item.point_id === recommendation.point_id);
  const objective =
    recommendation.objective === 'min-p50-latency' || recommendation.objective === 'min-p99-latency'
      ? STRINGS.zh.decision.recommendationObjective[recommendation.objective]
      : recommendation.objective.includes('activation')
        ? `highest activation-data rate at ${recommendation.objective.includes('p50') ? 'p50' : 'p99'} latency`
        : `highest total logical data rate at ${recommendation.objective.includes('p50') ? 'p50' : 'p99'} latency`;
  return point ? `T=${point.tokens_per_rank} 时 ${objective}` : objective;
}

function recommendationRationale(
  recommendation: CollectiveXRecommendation,
  locale: 'en' | 'zh',
): string {
  if (locale === 'zh' && recommendation.rationale === STRINGS.en.decision.rationale) {
    return STRINGS.zh.decision.rationale;
  }
  return recommendation.rationale;
}

function sensitivityLabel(sensitivity: CollectiveXSensitivity, locale: 'en' | 'zh'): string {
  if (locale === 'en') return sensitivity.label;
  return `${STRINGS.zh.decision.sensitivity}：${decisionMetricName(sensitivity.metric, locale)} T=${sensitivity.metric.tokens_per_rank}`;
}

function recommendationMetric(
  recommendation: CollectiveXRecommendation,
  seriesById: Map<string, CollectiveXSeries>,
): CollectiveXMetric | null {
  const series = seriesById.get(recommendation.series_id);
  const point = series?.points.find((item) => item.point_id === recommendation.point_id);
  if (!series || !point) return null;
  const [measure, statistic] = {
    'min-p50-latency': ['latency_us', 'p50'],
    'min-p99-latency': ['latency_us', 'p99'],
    'max-activation-data-rate-at-p50-latency': [
      'activation_data_rate_gbps_at_latency_percentile',
      'p50',
    ],
    'max-activation-data-rate-at-p99-latency': [
      'activation_data_rate_gbps_at_latency_percentile',
      'p99',
    ],
    'max-total-logical-data-rate-at-p50-latency': [
      'total_logical_data_rate_gbps_at_latency_percentile',
      'p50',
    ],
    'max-total-logical-data-rate-at-p99-latency': [
      'total_logical_data_rate_gbps_at_latency_percentile',
      'p99',
    ],
  }[recommendation.objective] as [CollectiveXMetric['measure'], CollectiveXMetric['statistic']];
  return {
    operation: 'roundtrip',
    statistic,
    measure,
    objective: measure === 'latency_us' ? 'min' : 'max',
    tokens_per_rank: point.tokens_per_rank,
    phase: series.phase,
  };
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
        header: 'Qualification',
        align: 'right',
        cell: (row) => `Q${row.qualification_index}`,
        sortValue: (row) => row.qualification_index,
        className: 'tabular-nums whitespace-nowrap',
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

interface RankingRow {
  ranking: CollectiveXRanking;
  rank: number;
  series: CollectiveXSeries;
  value: number;
  unit: string;
  pointId: string;
}

export function CollectiveXDecisionTables({
  dataset,
  cohort,
}: {
  dataset: CollectiveXDataset;
  cohort: CollectiveXCohort | null;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const seriesById = useMemo(
    () => new Map(dataset.series.map((item) => [item.series_id, item])),
    [dataset.series],
  );
  const rankings = cohort
    ? dataset.rankings
        .filter((item) => item.cohort_id === cohort.cohort_id)
        .toSorted(
          (left, right) =>
            compareCollectiveXDecisionMetrics(left.metric, right.metric) ||
            left.ranking_id.localeCompare(right.ranking_id),
        )
    : [];
  const recommendations = cohort
    ? dataset.recommendations
        .filter((item) => item.cohort_id === cohort.cohort_id)
        .toSorted((left, right) => {
          const leftMetric = recommendationMetric(left, seriesById);
          const rightMetric = recommendationMetric(right, seriesById);
          return (
            (leftMetric && rightMetric
              ? compareCollectiveXDecisionMetrics(leftMetric, rightMetric)
              : 0) || left.recommendation_id.localeCompare(right.recommendation_id)
          );
        })
    : [];
  const sensitivities = cohort
    ? dataset.sensitivities
        .filter((item) => item.cohort_id === cohort.cohort_id)
        .toSorted(
          (left, right) =>
            compareCollectiveXDecisionMetrics(left.metric, right.metric) ||
            left.candidate_series_id.localeCompare(right.candidate_series_id) ||
            left.sensitivity_id.localeCompare(right.sensitivity_id),
        )
    : [];
  const rankingRows = rankings.flatMap((ranking) =>
    ranking.entries
      .toSorted((left, right) => left.rank - right.rank)
      .flatMap((entry) => {
        const series = seriesById.get(entry.series_id);
        return series
          ? [
              {
                ranking,
                rank: entry.rank,
                series,
                value: entry.value,
                unit: entry.unit,
                pointId: entry.point_id,
              },
            ]
          : [];
      }),
  );
  const cohortDisplayLabel = cohort ? collectiveXCohortLabel(cohort, seriesById, locale) : '';
  const cohortMembers = cohort
    ? cohort.series_ids.flatMap((seriesId) => {
        const series = seriesById.get(seriesId);
        return series ? [series] : [];
      })
    : [];
  const sampling = cohortMembers[0]?.measurement;
  const rankingColumns = useMemo<DataTableColumn<RankingRow>[]>(
    () => [
      {
        header: t.comparison,
        cell: (row) => (cohort ? rankingLabel(row.ranking, cohort, locale) : row.ranking.label),
        sortValue: (row) =>
          cohort ? rankingLabel(row.ranking, cohort, locale) : row.ranking.label,
      },
      {
        header: t.metric,
        cell: (row) => metricLabel(row.ranking, locale),
        sortValue: (row) => metricLabel(row.ranking, locale),
      },
      {
        header: t.rank,
        align: 'right',
        cell: (row) => row.rank,
        sortValue: (row) => row.rank,
        className: 'tabular-nums',
      },
      {
        header: t.tierHeader,
        cell: (row) => <PublicationTierBadge tier={row.ranking.publication_tier} />,
        sortValue: (row) =>
          row.ranking.publication_tier === 'official' ? t.tier.official : t.tier.experimental,
      },
      {
        header: t.configuration,
        cell: (row) => collectiveXSeriesLabel(row.series),
        sortValue: (row) => collectiveXSeriesLabel(row.series),
        className: 'font-medium whitespace-nowrap',
      },
      {
        header: t.point,
        cell: (row) => (
          <span title={row.pointId} className="font-mono text-xs">
            {shortId(row.pointId)}
          </span>
        ),
        sortValue: (row) => row.pointId,
      },
      ...seriesContextColumns((row: RankingRow) => [row.series], t),
      {
        header: t.value,
        align: 'right',
        cell: (row) =>
          `${row.value.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: 2 })} ${row.unit}`,
        sortValue: (row) => row.value,
        className: 'tabular-nums whitespace-nowrap',
      },
    ],
    [cohort, locale, t],
  );

  if (!cohort) {
    return (
      <Card data-testid="collectivex-no-decisions">
        <p className="text-sm text-muted-foreground">{t.noControlledCohort}</p>
      </Card>
    );
  }

  return (
    <>
      <Card data-testid="collectivex-rankings">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{t.rankings}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{cohortDisplayLabel}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {cohortDescription(cohort, locale)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PublicationTierBadge tier={cohort.publication_tier} />
            <Badge variant="outline">
              {cohort.eligibility.allocation_ids.length} {t.allocations}
            </Badge>
          </div>
        </div>
        <div data-testid="collectivex-comparison-contract" className="mt-4 border-y py-3 text-sm">
          <h3 className="font-medium">{t.comparisonContract}</h3>
          <dl className="mt-2 grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">{t.controlledFactors}</dt>
              <dd className="mt-1">
                {cohort.controlled_factors.map((item) => factorLabel(item, locale)).join(' · ')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t.varyingFactors}</dt>
              <dd className="mt-1">
                {cohort.varying_factors.map((item) => factorLabel(item, locale)).join(' · ')}
              </dd>
            </div>
            {sampling && (
              <div>
                <dt className="text-xs text-muted-foreground">{t.sampling}</dt>
                <dd className="mt-1">
                  {t.samplingValue(sampling.trials, sampling.iters, sampling.samples_per_component)}
                </dd>
                <dt className="mt-2 text-xs text-muted-foreground">{t.warmups}</dt>
                <dd className="mt-1">{t.warmupValue(sampling.warmups)}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">{t.stableOrdering}</dt>
              <dd className="mt-1">
                {cohort.eligibility.stable_ordering
                  ? t.passed
                  : cohort.eligibility.reasons
                      .map((reason) => collectiveXReasonLabel(reason, locale))
                      .join(', ') || t.notPassed}
              </dd>
            </div>
          </dl>
        </div>
        <DataTable
          data={rankingRows}
          columns={rankingColumns}
          testId="collectivex-rankings-table"
          analyticsPrefix="collectivex_rankings_table"
        />
      </Card>
      {recommendations.length > 0 && (
        <RecommendationTable recommendations={recommendations} seriesById={seriesById} />
      )}
      {sensitivities.length > 0 && (
        <SensitivityTable sensitivities={sensitivities} seriesById={seriesById} />
      )}
    </>
  );
}

function RecommendationTable({
  recommendations,
  seriesById,
}: {
  recommendations: CollectiveXRecommendation[];
  seriesById: Map<string, CollectiveXSeries>;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const columns = useMemo<DataTableColumn<CollectiveXRecommendation>[]>(
    () => [
      {
        header: t.objective,
        cell: (row) => recommendationLabel(row, seriesById, locale),
        sortValue: (row) => recommendationLabel(row, seriesById, locale),
      },
      {
        header: t.recommendedConfiguration,
        cell: (row) => {
          const series = seriesById.get(row.series_id);
          return series ? collectiveXSeriesLabel(series) : '-';
        },
        sortValue: (row) => {
          const series = seriesById.get(row.series_id);
          return series ? collectiveXSeriesLabel(series) : '';
        },
        className: 'font-medium whitespace-nowrap',
      },
      {
        header: t.point,
        cell: (row) => (
          <span title={row.point_id} className="font-mono text-xs">
            {shortId(row.point_id)}
          </span>
        ),
        sortValue: (row) => row.point_id,
      },
      ...seriesContextColumns((row: CollectiveXRecommendation) => {
        const series = seriesById.get(row.series_id);
        return series ? [series] : [];
      }, t),
      {
        header: t.tierHeader,
        cell: (row) => <PublicationTierBadge tier={row.publication_tier} />,
        sortValue: (row) =>
          row.publication_tier === 'official' ? t.tier.official : t.tier.experimental,
      },
      {
        header: t.value,
        align: 'right',
        cell: (row) =>
          `${row.value.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: 2 })} ${row.unit}`,
        sortValue: (row) => row.value,
        className: 'tabular-nums whitespace-nowrap',
      },
      {
        header: t.basis,
        cell: (row) => recommendationRationale(row, locale),
        sortValue: (row) => recommendationRationale(row, locale),
      },
    ],
    [locale, seriesById, t],
  );
  return (
    <Card data-testid="collectivex-recommendations">
      <h2 className="text-lg font-semibold">{t.bestConfigurations}</h2>
      <DataTable
        data={recommendations}
        columns={columns}
        testId="collectivex-recommendations-table"
        analyticsPrefix="collectivex_recommendations_table"
      />
    </Card>
  );
}

function SensitivityTable({
  sensitivities,
  seriesById,
}: {
  sensitivities: CollectiveXSensitivity[];
  seriesById: Map<string, CollectiveXSeries>;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const columns = useMemo<DataTableColumn<CollectiveXSensitivity>[]>(
    () => [
      {
        header: t.contrast,
        cell: (row) => sensitivityLabel(row, locale),
        sortValue: (row) => sensitivityLabel(row, locale),
      },
      {
        header: t.baseline,
        cell: (row) => {
          const series = seriesById.get(row.baseline_series_id);
          return series ? collectiveXSeriesLabel(series) : '-';
        },
        sortValue: (row) => {
          const series = seriesById.get(row.baseline_series_id);
          return series ? collectiveXSeriesLabel(series) : '';
        },
      },
      {
        header: t.candidate,
        cell: (row) => {
          const series = seriesById.get(row.candidate_series_id);
          return series ? collectiveXSeriesLabel(series) : '-';
        },
        sortValue: (row) => {
          const series = seriesById.get(row.candidate_series_id);
          return series ? collectiveXSeriesLabel(series) : '';
        },
      },
      ...seriesContextColumns(
        (row: CollectiveXSensitivity) =>
          [seriesById.get(row.baseline_series_id), seriesById.get(row.candidate_series_id)].filter(
            (item): item is CollectiveXSeries => item !== undefined,
          ),
        t,
      ),
      {
        header: t.tierHeader,
        cell: (row) => <PublicationTierBadge tier={row.publication_tier} />,
        sortValue: (row) =>
          row.publication_tier === 'official' ? t.tier.official : t.tier.experimental,
      },
      {
        header: t.change,
        align: 'right',
        cell: (row) => `${(row.signed_change_ratio * 100).toFixed(1)}%`,
        sortValue: (row) => row.signed_change_ratio,
        className: 'tabular-nums',
      },
    ],
    [locale, seriesById, t],
  );
  return (
    <Card data-testid="collectivex-sensitivity">
      <h2 className="text-lg font-semibold">{t.routingSensitivity}</h2>
      <DataTable
        data={sensitivities}
        columns={columns}
        testId="collectivex-sensitivity-table"
        analyticsPrefix="collectivex_sensitivity_table"
      />
    </Card>
  );
}
