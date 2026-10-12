'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CURRENT_TRACE_VERSION } from '@semianalysisai/inferencex-db/proxytrace/shared/trace';
import { useTraceVersion } from '@/hooks/agentic-workload-explorer/use-trace-version';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';

const STRINGS = {
  en: {
    allVersions: 'All versions',
  },
  zh: {
    allVersions: '所有版本',
  },
} as const;

/**
 * Global trace-version selector. Mounted once in the dashboard layout header;
 * reads/writes `?version=` so every page sees the same selection.
 *
 * The read-only snapshot only contains the current trace version, so the
 * options are just `All` and `vN` (CURRENT_TRACE_VERSION).
 */
export function TraceVersionSelector() {
  const { selection, setSelection } = useTraceVersion();
  const t = STRINGS[useLocale()];

  const options = [
    { value: 'all', label: t.allVersions },
    { value: String(CURRENT_TRACE_VERSION), label: `v${CURRENT_TRACE_VERSION}` },
  ];

  return (
    <Select
      value={selection === 'all' ? 'all' : String(selection)}
      onValueChange={(v) => {
        const newSelection = v === 'all' ? 'all' : Number(v);
        setSelection(newSelection);
        track('agentic_workload_trace_version_changed', { version: newSelection });
      }}
    >
      <SelectTrigger size="sm" aria-label={t.allVersions} className="min-w-[110px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
