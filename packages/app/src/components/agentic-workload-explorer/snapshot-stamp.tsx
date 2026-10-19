'use client';

import { Snowflake } from 'lucide-react';

import {
  LAST_DAY_LABEL,
  SNAPSHOT_END_CLOCK,
  SNAPSHOT_RANGE_LABEL,
} from '@/lib/agentic-workload-explorer/snapshot';
import { useLocale } from '@/lib/i18n/use-locale';

const STRINGS = {
  en: {
    stamp: 'Frozen snapshot',
    dataEnds: 'data ends',
    title: `Frozen, read-only snapshot. No new data arrives; every "final 24h", "last day" or "last 30 days" window ends at ${LAST_DAY_LABEL} ${SNAPSHOT_END_CLOCK}. Experimental dashboard: no guarantee of data quality except for released HuggingFace datasets.`,
  },
  zh: {
    stamp: '冻结快照',
    dataEnds: '数据截至',
    title: `冻结的只读快照，不再有新数据写入；所有”最后 24 小时””最后一天””最后 30 天”窗口均截止于 ${LAST_DAY_LABEL} ${SNAPSHOT_END_CLOCK}。实验性仪表板：除已发布的 HuggingFace 数据集外，不保证数据质量。`,
  },
};

export function SnapshotStamp() {
  const strings = STRINGS[useLocale()];
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-brand" title={strings.title}>
      <Snowflake className="size-3.5 shrink-0" aria-hidden />
      <span className="shrink-0 font-semibold uppercase tracking-eyebrow">{strings.stamp}</span>
      <span className="hidden truncate text-muted-foreground sm:inline">
        {SNAPSHOT_RANGE_LABEL} · {strings.dataEnds} {LAST_DAY_LABEL} {SNAPSHOT_END_CLOCK}
      </span>
    </div>
  );
}
