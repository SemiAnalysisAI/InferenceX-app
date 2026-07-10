'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { FRAMEWORK_LABELS } from '@semianalysisai/inferencex-constants';

import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import type { Locale } from '@/lib/i18n';
import { BottomToast } from '@/components/ui/bottom-toast';

/**
 * Detail for a rejected or automatically resolved cross-engine selection.
 * Explicit conflicting adds are blocked; reset/select-all paths report which
 * comparability groups were kept or removed.
 */
export type EngineComparisonConflictDetail =
  | { kind: 'blocked'; attempted: string; existing: string | null }
  | { kind: 'resolved'; kept: string[]; dropped: string[] };

function familyLabel(family: string): string {
  return FRAMEWORK_LABELS[family] ?? family;
}

function joinList(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
}

function joinListZh(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} 和 ${parts[1]}`;
  return `${parts.slice(0, -1).join('、')}和 ${parts.at(-1)}`;
}

function describe(detail: EngineComparisonConflictDetail, locale: Locale): string {
  if (locale === 'zh') return describeZh(detail);
  if (detail.kind === 'blocked') {
    const attempted = familyLabel(detail.attempted);
    if (detail.existing) {
      const existing = familyLabel(detail.existing);
      return `${attempted} and ${existing} use engine-specific benchmark implementations, so their numbers aren't directly comparable in this view. Remove the ${existing} configs first to switch.`;
    }
    return `${attempted} can't be enabled while another engine family is active. Remove the existing configs first.`;
  }
  const kept = [...detail.kept].toSorted().map(familyLabel);
  const dropped = [...detail.dropped].toSorted().map(familyLabel);
  if (kept.length > 0) {
    return `Only compatible engine families can be shown together in this view. Kept ${joinList(kept)} and removed ${joinList(dropped)} configs.`;
  }
  if (dropped.length === 0) {
    return `Configs from different engine families can't be shown on the same graph in this view.`;
  }
  return `${joinList(dropped)} use engine-specific benchmark implementations and can't be shown on the same graph in this view. Conflicting configs were disabled; enable one engine family from the legend.`;
}

function describeZh(detail: EngineComparisonConflictDetail): string {
  if (detail.kind === 'blocked') {
    const attempted = familyLabel(detail.attempted);
    if (detail.existing) {
      const existing = familyLabel(detail.existing);
      return `${attempted} 和 ${existing} 使用各自引擎的基准测试实现，因此在此视图中无法直接比较。请先移除 ${existing} 配置再切换。`;
    }
    return `另一个引擎系列处于启用状态时，无法启用 ${attempted}。请先移除现有配置。`;
  }
  const kept = [...detail.kept].toSorted().map(familyLabel);
  const dropped = [...detail.dropped].toSorted().map(familyLabel);
  if (kept.length > 0) {
    return `此视图只能同时显示相互兼容的引擎系列。已保留 ${joinListZh(kept)}，并移除 ${joinListZh(dropped)} 配置。`;
  }
  if (dropped.length === 0) {
    return '此视图无法在同一图表上显示不同引擎系列的配置。';
  }
  return `${joinListZh(dropped)} 使用各自引擎的基准测试实现，无法在此视图的同一图表上显示。冲突配置已禁用；请从图例中启用一个引擎系列。`;
}

const TITLES = {
  en: "Configs from different engines can't share a graph",
  zh: '不同引擎的配置无法共享同一图表',
} as const;

interface Props {
  detail: EngineComparisonConflictDetail | null;
  onDismiss?: () => void;
}

export function EngineComparisonConflictToast({ detail, onDismiss }: Props) {
  const locale = useLocale();
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    if (!detail) return;
    setSeq((n) => n + 1);
    track('inference_engine_comparison_conflict_blocked', {
      kind: detail.kind,
      attempted: detail.kind === 'blocked' ? detail.attempted : null,
      existing: detail.kind === 'blocked' ? detail.existing : null,
      kept: detail.kind === 'resolved' ? detail.kept : null,
      dropped: detail.kind === 'resolved' ? detail.dropped : null,
    });
  }, [detail]);

  if (!detail) return null;

  return (
    <BottomToast
      key={seq}
      testId="engine-comparison-conflict-toast"
      icon={<AlertTriangle className="text-amber-500" />}
      title={TITLES[locale]}
      description={describe(detail, locale)}
      onDismiss={onDismiss}
    />
  );
}
