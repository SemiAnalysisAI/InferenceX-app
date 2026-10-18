'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  ConversationView,
  buildConversationTree,
} from '@/components/agentic-workload-explorer/conversation-view';
import { useSession } from '@/lib/agentic-workload-explorer/session-context';
import {
  useSessionReplay,
  ReplayControls,
} from '@/components/agentic-workload-explorer/session-replay';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';

const STRINGS = {
  en: {
    exitReplay: '⏹ Exit Replay',
    replay: '▶ Replay',
    loadingRequests: (loaded: number, total: number) =>
      `Loading all requests (${loaded} / ${total})...`,
  },
  zh: {
    exitReplay: '⏹ 退出回放',
    replay: '▶ 回放',
    loadingRequests: (loaded: number, total: number) => `加载全部请求中 (${loaded} / ${total})…`,
  },
};

function getHashTargetId(hash: string): string | null {
  if (!hash.startsWith('#req-')) return null;
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return hash.slice(1);
  }
}

export default function ConversationPage() {
  const t = STRINGS[useLocale()];
  const { requests, total, loadUntil, reversed } = useSession();
  const [replayMode, setReplayMode] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  const [targetHash, setTargetHash] = useState('');
  const lastNodeRef = useRef<HTMLDivElement>(null);
  const pendingTargetRef = useRef<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build tree and extract timestamps when in replay mode
  const tree = useMemo(
    () => (replayMode ? buildConversationTree(requests) : []),
    [replayMode, requests],
  );

  const timestamps = useMemo(
    () =>
      tree.map((node) => {
        if (node.kind === 'message') {
          return new Date(node.timestamp).getTime();
        }
        // subagent_group
        return new Date(node.startTime).getTime();
      }),
    [tree],
  );

  const nodeCount = tree.length;

  const replay = useSessionReplay(nodeCount, timestamps);

  // Load all data when replay mode is activated
  const handleEnableReplay = useCallback(async () => {
    setReplayMode(true);
    if (requests.length < total) {
      setLoadingAll(true);
      try {
        await loadUntil(total);
      } catch (error) {
        console.error('Failed to load all requests for replay:', error);
      }
      setLoadingAll(false);
    }
    setAllLoaded(true);
  }, [requests.length, total, loadUntil]);

  const handleDisableReplay = useCallback(() => {
    replay.reset();
    setReplayMode(false);
    setAllLoaded(false);
  }, [replay]);

  // Check if data finished loading (e.g., loaded by layout scroll)
  useEffect(() => {
    if (!replayMode || allLoaded || requests.length < total) return;

    const frame = requestAnimationFrame(() => {
      setLoadingAll(false);
      setAllLoaded(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [replayMode, allLoaded, requests.length, total]);

  // Auto-scroll to keep latest revealed message visible during playback
  useEffect(() => {
    if (replayMode && replay.isPlaying && lastNodeRef.current) {
      lastNodeRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [replayMode, replay.isPlaying, replay.currentIndex]);

  const replayReady = replayMode && allLoaded && nodeCount > 0;

  useEffect(() => {
    const syncHash = () => setTargetHash(window.location.hash);

    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  // Scroll to hash target after requests load/render (e.g., from waterfall click).
  useEffect(() => {
    const targetId = getHashTargetId(targetHash);
    if (!targetId) return;

    const frame = requestAnimationFrame(() => {
      const el = document.querySelector(`#${targetId}`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        pendingTargetRef.current = null;

        if (highlightTimerRef.current) {
          clearTimeout(highlightTimerRef.current);
        }
        el.classList.remove('waterfall-highlight');
        // Restart the animation when navigating to a request that was just highlighted.
        void el.offsetWidth;
        el.classList.add('waterfall-highlight');
        highlightTimerRef.current = setTimeout(() => {
          el.classList.remove('waterfall-highlight');
          highlightTimerRef.current = null;
        }, 2500);
        return;
      }

      if (requests.length < total && pendingTargetRef.current !== targetId) {
        pendingTargetRef.current = targetId;
        loadUntil(total)
          .catch(console.error)
          .finally(() => {
            if (pendingTargetRef.current === targetId) {
              pendingTargetRef.current = null;
            }
          });
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [targetHash, requests.length, total, loadUntil]);

  useEffect(
    () => () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    },
    [],
  );

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Replay toggle button */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => {
              track('agentic_workload_replay_toggled', { enabled: !replayMode });
              if (replayMode) handleDisableReplay();
              else handleEnableReplay();
            }}
            className={`flex items-center gap-1.5 px-2 py-1 text-2xs font-mono border rounded-md transition-colors ${
              replayMode
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20'
                : 'bg-surface hover:bg-surface-hover border-border text-subtle hover:text-foreground'
            }`}
          >
            {replayMode ? t.exitReplay : t.replay}
          </button>
          {loadingAll && (
            <span className="flex items-center gap-1.5 text-2xs font-mono text-subtle">
              <span className="h-3 w-3 border-2 border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
              {t.loadingRequests(requests.length, total)}
            </span>
          )}
        </div>

        {/* Replay controls bar */}
        {replayReady && (
          <div className="mb-3">
            <ReplayControls
              isPlaying={replay.isPlaying}
              currentIndex={replay.currentIndex}
              total={nodeCount}
              speed={replay.speed}
              onToggle={replay.toggle}
              onSpeedChange={replay.setSpeed}
              onSeek={replay.seekTo}
              onReset={replay.reset}
            />
          </div>
        )}

        {/* Conversation view */}
        <div>
          <ConversationView
            requests={requests}
            visibleNodeCount={replayReady ? replay.currentIndex : undefined}
            reversed={replayMode ? false : Boolean(reversed)}
          />
          {/* Scroll anchor for auto-scroll during playback */}
          <div ref={lastNodeRef} />
        </div>
      </CardContent>
    </Card>
  );
}
