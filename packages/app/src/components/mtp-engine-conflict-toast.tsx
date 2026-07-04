'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { FRAMEWORK_LABELS } from '@semianalysisai/inferencex-constants';

import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import type { Locale } from '@/lib/i18n';
import { BottomToast } from '@/components/ui/bottom-toast';

/**
 * Discriminated detail for the MTP-engine-conflict toast.
 *
 *  - `blocked`: the user explicitly tried to add a second engine family's MTP
 *    config; the action was refused. Names the attempted and existing families.
 *  - `cleared`: a non-toggle path (model reset, select-all) saw multiple
 *    families simultaneously and disabled them all. Names the dropped families.
 */
export type MtpEngineConflictDetail =
  | { kind: 'blocked'; attempted: string; existing: string | null }
  | { kind: 'cleared'; families: string[] };

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

function describe(detail: MtpEngineConflictDetail, locale: Locale): string {
  if (locale === 'zh') return describeZh(detail);
  if (detail.kind === 'blocked') {
    const attempted = familyLabel(detail.attempted);
    if (detail.existing) {
      const existing = familyLabel(detail.existing);
      return `${attempted} and ${existing} use different MTP acceptance-rate implementations, so their numbers aren't directly comparable. Remove the ${existing} MTP config first to switch.`;
    }
    return `${attempted} MTP can't be enabled while another engine's MTP is active. Remove the existing MTP config first.`;
  }
  const labels = [...detail.families].toSorted().map(familyLabel);
  if (labels.length === 0) {
    return `MTP configs from different engines use different acceptance-rate implementations and can't be shown on the same graph. All MTP configs are disabled by default. Enable one from the legend to view it.`;
  }
  return `${joinList(labels)} use different MTP acceptance-rate implementations and can't be shown on the same graph. All MTP configs are disabled by default. Enable one from the legend to view it.`;
}

function describeZh(detail: MtpEngineConflictDetail): string {
  if (detail.kind === 'blocked') {
    const attempted = familyLabel(detail.attempted);
    if (detail.existing) {
      const existing = familyLabel(detail.existing);
      return `${attempted} 和 ${existing} 使用不同的 MTP 接受率实现，数值不可直接比较。请先移除 ${existing} MTP 配置再切换。`;
    }
    return `另一个引擎的 MTP 处于启用状态时，无法启用 ${attempted} MTP。请先移除现有 MTP 配置。`;
  }
  const labels = [...detail.families].toSorted().map(familyLabel);
  if (labels.length === 0) {
    return '不同引擎的 MTP 配置使用不同的接受率实现，无法在同一图表上显示。所有 MTP 配置默认禁用，请从图例中启用一项来查看。';
  }
  return `${joinListZh(labels)} 使用不同的 MTP 接受率实现，无法在同一图表上显示。所有 MTP 配置默认禁用，请从图例中启用一项来查看。`;
}

const TITLES = {
  en: "MTP configs from different engines can't share a graph",
  zh: '不同引擎的 MTP 配置无法共享同一图表',
} as const;

interface Props {
  detail: MtpEngineConflictDetail | null;
  onDismiss?: () => void;
}

export function MtpEngineConflictToast({ detail, onDismiss }: Props) {
  const locale = useLocale();
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    if (!detail) return;
    setSeq((n) => n + 1);
    track('inference_mtp_engine_conflict_blocked', {
      kind: detail.kind,
      attempted: detail.kind === 'blocked' ? detail.attempted : null,
      existing: detail.kind === 'blocked' ? detail.existing : null,
      families: detail.kind === 'cleared' ? detail.families : null,
    });
  }, [detail]);

  if (!detail) return null;

  return (
    <BottomToast
      key={seq}
      testId="mtp-engine-conflict-toast"
      icon={<AlertTriangle className="text-amber-500" />}
      title={TITLES[locale]}
      description={describe(detail, locale)}
      onDismiss={onDismiss}
    />
  );
}
