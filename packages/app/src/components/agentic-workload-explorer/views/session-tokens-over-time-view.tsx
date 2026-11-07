'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/agentic-workload-explorer/session-context';
import {
  MAIN_AGENT_KEY,
  buildAgentOptions,
  buildContextTrajectories,
  buildTokenPoints,
  type TokenSplitMode,
} from '@/lib/agentic-workload-explorer/tokens-over-time';
import { TokensOverTimeChart } from '@/components/agentic-workload-explorer/tokens-over-time-chart';
import { ContextTrajectoriesChart } from '@/components/agentic-workload-explorer/context-trajectories-chart';
import { Expandable } from '@/components/agentic-workload-explorer/expandable-chart';
import { useExplorerHref } from '@/hooks/agentic-workload-explorer/use-explorer-href';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';

const STRINGS = {
  en: {
    cachedVsUncached: 'Cached vs uncached',
    contextTrajectories: 'Context trajectories',
    apiCache: 'API cache',
    hashBlocks: 'Hash blocks',
    agentLabel: 'Agent',
    mainAgent: 'Main agent',
    tokensOverTimeTitle: 'Tokens over time',
    viewLabel: 'Chart',
    modeLabel: 'Cache view',
  },
  zh: {
    cachedVsUncached: '已缓存 vs 未缓存',
    contextTrajectories: '上下文增长轨迹',
    apiCache: 'API Cache',
    hashBlocks: 'Hash Blocks',
    agentLabel: '智能体',
    mainAgent: '主智能体',
    tokensOverTimeTitle: 'Token 时间分布',
    viewLabel: '图表',
    modeLabel: '缓存视图',
  },
} as const;

type View = 'cached' | 'trajectories';

function parseView(raw: string | null): View {
  return raw === 'trajectories' ? 'trajectories' : 'cached';
}

function parseMode(raw: string | null): TokenSplitMode {
  return raw === 'hash' ? 'hash' : 'api';
}

export default function TokensOverTimePage() {
  return (
    <Suspense>
      <TokensOverTimePageContent />
    </Suspense>
  );
}

function TokensOverTimePageContent() {
  const t = STRINGS[useLocale()];
  const explorerHref = useExplorerHref();
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = parseView(searchParams.get('view'));
  const mode = parseMode(searchParams.get('mode'));
  const { requests, session } = useSession();

  const agentOptions = useMemo(() => buildAgentOptions(requests), [requests]);
  const rawAgentKey = searchParams.get('agent') ?? MAIN_AGENT_KEY;
  const agentKey = agentOptions.some((a) => a.key === rawAgentKey) ? rawAgentKey : MAIN_AGENT_KEY;
  const activeAgent = agentOptions.find((a) => a.key === agentKey) ?? null;

  const points = useMemo(() => buildTokenPoints(requests, agentKey), [requests, agentKey]);
  const trajectories = useMemo(() => buildContextTrajectories(requests), [requests]);

  const VIEWS: { value: View; label: string }[] = [
    { value: 'cached', label: t.cachedVsUncached },
    { value: 'trajectories', label: t.contextTrajectories },
  ];

  const MODES: { value: TokenSplitMode; label: string }[] = [
    { value: 'api', label: t.apiCache },
    { value: 'hash', label: t.hashBlocks },
  ];

  function setParam(key: 'view' | 'mode' | 'agent', value: string, defaultValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === defaultValue) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const qs = params.toString();
    router.replace(explorerHref(`/sessions/${session.id}/tokens-over-time${qs ? `?${qs}` : ''}`), {
      scroll: false,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedToggle
          role="group"
          ariaLabel={t.viewLabel}
          value={view}
          onValueChange={(next) => {
            setParam('view', next, 'cached');
            track('agentic_workload_tokens_view_changed', { view: next });
          }}
          options={VIEWS}
        />

        {view === 'cached' && (
          <>
            <SegmentedToggle
              role="group"
              ariaLabel={t.modeLabel}
              value={mode}
              onValueChange={(next) => {
                setParam('mode', next, 'api');
                track('agentic_workload_tokens_mode_changed', { mode: next });
              }}
              options={MODES}
            />

            {agentOptions.length > 1 && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                {t.agentLabel}
                <select
                  value={agentKey}
                  onChange={(e) => {
                    setParam('agent', e.target.value, MAIN_AGENT_KEY);
                    track('agentic_workload_tokens_agent_changed', { agent: e.target.value });
                  }}
                  className="h-11 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none md:h-8"
                >
                  {agentOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label} ({opt.requestCount})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
      </div>

      <Expandable
        title={view === 'cached' ? t.tokensOverTimeTitle : t.contextTrajectories}
        subtitle={view === 'cached' ? (activeAgent?.label ?? t.mainAgent) : undefined}
        corner
      >
        {view === 'cached' ? (
          <TokensOverTimeChart
            points={points}
            mode={mode}
            agentLabel={activeAgent?.label ?? t.mainAgent}
          />
        ) : (
          <ContextTrajectoriesChart trajectories={trajectories} />
        )}
      </Expandable>
    </div>
  );
}
