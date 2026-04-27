'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { FRAMEWORK_LABELS } from '@semianalysisai/inferencex-constants';

import { track } from '@/lib/analytics';
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

function describe(detail: MtpEngineConflictDetail): string {
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
    return `MTP configs from different engines use different acceptance-rate implementations and can't be shown on the same graph. All MTP configs are disabled by default — enable one from the legend to view it.`;
  }
  return `${joinList(labels)} use different MTP acceptance-rate implementations and can't be shown on the same graph. All MTP configs are disabled by default — enable one from the legend to view it.`;
}

interface Props {
  detail: MtpEngineConflictDetail | null;
  onDismiss?: () => void;
}

export function MtpEngineConflictToast({ detail, onDismiss }: Props) {
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
      title="MTP configs from different engines can't share a graph"
      description={describe(detail)}
      onDismiss={onDismiss}
    />
  );
}
