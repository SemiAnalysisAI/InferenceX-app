'use client';

import { Suspense } from 'react';
import { SessionReuseView } from '@/components/agentic-workload-explorer/session-reuse-view';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import {
  appendTraceVersion,
  useTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';
import {
  REUSE_FOLLOWUP_DAYS,
  type SessionReusePayload,
} from '@semianalysisai/inferencex-db/proxytrace/shared/session-reuse';

const STRINGS = {
  en: {
    loading: 'Loading session reuse…',
    error: 'Unable to load session reuse.',
    retry: 'Retry',
    setupRequired:
      'Analytics storage needs a server database migration. Contact your administrator.',
    warming: 'Session reuse is not available in this snapshot.',
    reload: 'Reload',
  },
  zh: {
    loading: '正在加载 session 复用数据…',
    error: '无法加载 session 复用数据。',
    retry: '重试',
    setupRequired: '分析存储需要服务器数据库迁移。请联系管理员。',
    warming: '此快照中暂无 session 复用数据。',
    reload: '重新加载',
  },
} as const;

type ResponseData =
  | (SessionReusePayload & { cachedAt: string })
  | { warming: true }
  | { setupRequired: true };
const allDays = Array.from({ length: REUSE_FOLLOWUP_DAYS }, (_, i) => i + 1).join(',');

function Content() {
  const t = STRINGS[useLocale()];
  const { apiParam } = useTraceVersion();
  const { data, loading, error, reload } = useDashboardData<ResponseData>({
    key: String(apiParam),
    fetcher: async (signal) => {
      const response = await fetch(
        appendTraceVersion(
          `/api/v1/agentic-workload-explorer/session-reuse?days=${allDays}`,
          apiParam,
        ),
        { signal },
      );
      if (!response.ok) throw new Error('Unable to load session reuse metrics');
      return response.json();
    },
  });
  if (loading)
    return (
      <p className="text-xs font-mono text-muted-foreground" role="status">
        {t.loading}
      </p>
    );
  if (error || !data)
    return (
      <div role="alert" className="text-xs font-mono">
        {t.error}{' '}
        <button
          onClick={() => {
            track('agentic_workload_session_reuse_retry');
            reload();
          }}
          className="underline"
        >
          {t.retry}
        </button>
      </div>
    );
  if ('setupRequired' in data)
    return <p className="text-xs text-muted-foreground">{t.setupRequired}</p>;
  if ('warming' in data)
    return (
      <div className="text-xs font-mono text-muted-foreground" role="status">
        {t.warming}{' '}
        <button
          onClick={() => {
            track('agentic_workload_session_reuse_reload');
            reload();
          }}
          className="underline text-foreground"
        >
          {t.reload}
        </button>
      </div>
    );
  return <SessionReuseView data={data} />;
}

export default function SessionReusePage() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
