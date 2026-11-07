'use client';

import { AlertTriangle } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';

import { FRAMEWORK_LABELS } from '@semianalysisai/inferencex-constants';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import type { Locale } from '@/lib/i18n/i18n';
import { InlineNotice } from '@/components/ui/inline-notice';

export type EngineComparisonConflictDetail =
  | { kind: 'blocked'; attempted: string; existing: string | null }
  | { kind: 'resolved'; kept: string[]; dropped: string[]; partial: string[] };

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

export function describeEngineComparisonConflict(
  detail: EngineComparisonConflictDetail,
  locale: Locale,
): string {
  if (
    detail.kind === 'blocked' &&
    ((detail.attempted === 'vllm' && detail.existing === 'sglang') ||
      (detail.attempted === 'sglang' && detail.existing === 'vllm'))
  ) {
    return locale === 'zh'
      ? 'vLLM 和 SGLang 采用不同的推理方式，因此无法直接比较。另外，我们也不想引发 vLLM 和 SGLang 之间的争论，笑死。'
      : 'vLLM & SGLang take different approaches to inference and so they aren’t directly comparable. Also, we don’t want to start vLLM vs SGLang drama LMFAO';
  }
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
  const partial = [...detail.partial].toSorted().map(familyLabel);
  if (partial.length > 0) {
    const removed = dropped.length > 0 ? ` Removed ${joinList(dropped)} configs.` : '';
    return `Only compatible engine configurations can be shown together in this view.${removed} Disabled conflicting ${joinList(partial)} configs while compatible ${joinList(partial)} configs remain shown.`;
  }
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
  const partial = [...detail.partial].toSorted().map(familyLabel);
  if (partial.length > 0) {
    const removed = dropped.length > 0 ? ` 已移除 ${joinListZh(dropped)} 配置。` : '';
    return `此视图只能同时显示相互兼容的引擎配置。${removed}已禁用冲突的 ${joinListZh(partial)} 配置，同时保留兼容的 ${joinListZh(partial)} 配置。`;
  }
  if (kept.length > 0) {
    return `此视图只能同时显示相互兼容的引擎系列。已保留 ${joinListZh(kept)}，并移除 ${joinListZh(dropped)} 配置。`;
  }
  if (dropped.length === 0) {
    return '此视图无法在同一图表上显示不同引擎系列的配置。';
  }
  return `${joinListZh(dropped)} 使用各自引擎的基准测试实现，无法在此视图的同一图表上显示。冲突配置已禁用；请从图例中启用一个引擎系列。`;
}

const TITLES = {
  en: 'vLLM & SGLang on same SKU can’t share a graph',
  zh: '同一 SKU 上的 vLLM 和 SGLang 无法在同一图表中显示',
} as const;

interface ConflictState {
  detail: EngineComparisonConflictDetail | null;
  onDismiss: () => void;
  onCompare?: () => void;
}

const ConflictContext = createContext<ConflictState | null>(null);

export function EngineComparisonConflictProvider({
  children,
  ...state
}: ConflictState & { children: ReactNode }) {
  const { detail } = state;
  useEffect(() => {
    if (!detail) return;
    track('inference_engine_comparison_conflict_blocked', {
      kind: detail.kind,
      attempted: detail.kind === 'blocked' ? detail.attempted : null,
      existing: detail.kind === 'blocked' ? detail.existing : null,
      kept: detail.kind === 'resolved' ? detail.kept : null,
      dropped: detail.kind === 'resolved' ? detail.dropped : null,
      partial: detail.kind === 'resolved' ? detail.partial : null,
    });
  }, [detail]);
  return <ConflictContext.Provider value={state}>{children}</ConflictContext.Provider>;
}

let owners: symbol[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function useIsFirstNotice(): boolean {
  const [owner] = useState(() => Symbol('engine-conflict-notice'));
  useEffect(() => {
    owners = [...owners, owner];
    for (const listener of listeners) listener();
    return () => {
      owners = owners.filter((entry) => entry !== owner);
      for (const listener of listeners) listener();
    };
  }, [owner]);
  return useSyncExternalStore(
    subscribe,
    () => owners[0] === owner,
    () => false,
  );
}

export function EngineComparisonConflictNotice({ className }: { className?: string }) {
  const locale = useLocale();
  const state = useContext(ConflictContext);
  const isFirst = useIsFirstNotice();
  if (!state?.detail || !isFirst) return null;
  const { detail, onDismiss, onCompare } = state;

  return (
    <InlineNotice
      testId="engine-comparison-conflict-notice"
      tone="warning"
      collapsible
      icon={AlertTriangle}
      title={
        onCompare
          ? locale === 'zh'
            ? '同时显示前需确认'
            : 'Confirm before showing both engines'
          : TITLES[locale]
      }
      description={describeEngineComparisonConflict(detail, locale)}
      onDismiss={onDismiss}
      action={
        onCompare
          ? {
              label: locale === 'zh' ? '查看对比提示' : 'Review comparison warning',
              onClick: onCompare,
            }
          : undefined
      }
      className={className}
    />
  );
}
