'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { track } from '@/lib/analytics';
import { BottomToast } from '@/components/ui/bottom-toast';
import {
  MTP_ENGINE_CONFLICT_EVENT,
  type MtpEngineConflictDetail,
} from '@/lib/mtp-engine-conflict-event';

const FRAMEWORK_LABEL: Record<string, string> = {
  vllm: 'vLLM',
  sglang: 'SGLang',
  trt: 'TRT',
  atom: 'ATOM',
};

function familyLabel(family: string | null): string {
  if (!family) return '';
  return FRAMEWORK_LABEL[family] ?? family;
}

export function MtpEngineConflictToast() {
  const [detail, setDetail] = useState<MtpEngineConflictDetail | null>(null);
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    const handle = (e: Event) => {
      const next = (e as CustomEvent<MtpEngineConflictDetail>).detail;
      setDetail(next);
      setSeq((n) => n + 1);
      track('inference_mtp_engine_conflict_blocked', {
        attempted: next?.attempted ?? null,
        existing: next?.existing ?? null,
      });
    };
    window.addEventListener(MTP_ENGINE_CONFLICT_EVENT, handle);
    return () => window.removeEventListener(MTP_ENGINE_CONFLICT_EVENT, handle);
  }, []);

  if (!detail) return null;

  const attempted = familyLabel(detail.attempted);
  const existing = familyLabel(detail.existing);
  const description =
    attempted && existing
      ? `${attempted} and ${existing} use different MTP acceptance-rate implementations, so their numbers aren't directly comparable. Remove the ${existing} MTP config first to switch.`
      : `vLLM and SGLang use different MTP acceptance-rate implementations and can't be shown on the same graph. Both MTP configs are disabled by default — enable one from the legend to view it.`;

  return (
    <BottomToast
      key={seq}
      testId="mtp-engine-conflict-toast"
      icon={<AlertTriangle className="text-amber-500" />}
      title="MTP configs from different engines can't share a graph"
      description={description}
    />
  );
}
