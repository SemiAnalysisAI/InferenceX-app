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
import { useExplorerHref } from '@/hooks/agentic-workload-explorer/use-explorer-href';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';

const STRINGS = {
  en: {
    cachedVsUncached: 'Cached vs Uncached',
    contextTrajectories: 'Context Trajectories',
    apiCache: 'API Cache',
    hashBlocks: 'Hash Blocks',
    agentLabel: 'Agent',
    mainAgent: 'Main Agent',
  },
  zh: {
    cachedVsUncached: '已缓存 vs 未缓存',
    contextTrajectories: '上下文增长轨迹',
    apiCache: 'API Cache',
    hashBlocks: 'Hash Blocks',
    agentLabel: '智能体',
    mainAgent: '主智能体',
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
  // Fall back to main when the URL points at an agent key that doesn't exist
  // in this session (e.g. stale share link, or sub-agent filtered out by the
  // agent-id grouping rules).
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
        <div className="flex items-center gap-1">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => {
                setParam('view', v.value, 'cached');
                track('agentic_workload_tokens_view_changed', { view: v.value });
              }}
              className={`rounded-md px-2.5 py-1 font-mono text-3xs uppercase tracking-wider transition-colors ${
                view === v.value
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Mode toggle + agent selector only apply to the cached/uncached
            view — the trajectory view always uses Anthropic-reported totals
            and plots every agent. */}
        {view === 'cached' && (
          <>
            <div className="flex items-center overflow-hidden rounded-md border border-border">
              {MODES.map((m, idx) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => {
                    setParam('mode', m.value, 'api');
                    track('agentic_workload_tokens_mode_changed', { mode: m.value });
                  }}
                  className={`px-2.5 py-1 font-mono text-3xs transition-colors ${
                    idx > 0 ? 'border-l border-border' : ''
                  } ${
                    mode === m.value
                      ? 'bg-surface-hover text-foreground'
                      : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {agentOptions.length > 1 && (
              <label className="flex items-center gap-2 font-mono text-3xs uppercase tracking-wider text-muted-foreground">
                {t.agentLabel}
                <select
                  value={agentKey}
                  onChange={(e) => {
                    setParam('agent', e.target.value, MAIN_AGENT_KEY);
                    track('agentic_workload_tokens_agent_changed', { agent: e.target.value });
                  }}
                  className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-3xs normal-case tracking-normal text-foreground transition-colors hover:bg-surface-hover focus:outline-none"
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

      {view === 'cached' ? (
        <TokensOverTimeChart
          points={points}
          mode={mode}
          agentLabel={activeAgent?.label ?? t.mainAgent}
        />
      ) : (
        <ContextTrajectoriesChart trajectories={trajectories} />
      )}
    </div>
  );
}
