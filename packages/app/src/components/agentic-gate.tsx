'use client';

import { notFound } from 'next/navigation';
import { useEffect, useState } from 'react';

import { FEATURE_GATE_KEY, useFeatureGate } from '@/lib/use-feature-gate';

/**
 * Client gate for the standalone agentic product pages (`/datasets/*`,
 * `/inference/agentic/[id]`). These are server-rendered routes with no nav
 * entry once the header link is hidden, so a direct URL visit is the only way
 * in. When the shared konami-code feature gate (see {@link useFeatureGate}) is
 * locked — the default until agentic launches — we `notFound()` so the route
 * behaves like a clean 404 instead of publicly exposing agentic surfaces.
 *
 * The gate lives in localStorage, which the server can't read, so we resolve it
 * on the client: read the flag synchronously on mount, and until then render
 * nothing (no content flash before a potential 404). QA can unlock at runtime
 * with ↑↑↓↓ (the same mechanism as the Hidden tab dropdown) or by seeding
 * `localStorage['inferencex-feature-gate'] = '1'`, after which these pages
 * render in full.
 */
export function AgenticGate({ children }: { children: React.ReactNode }) {
  const unlocked = useFeatureGate();
  // Distinguish "haven't read localStorage yet" from "read it, gate is locked":
  // useFeatureGate() returns false on the server and on the very first client
  // render before its mount effect runs, so we must not 404 during that window.
  const [resolved, setResolved] = useState(false);
  useEffect(() => setResolved(true), []);

  if (!resolved) return null;
  if (!unlocked) {
    // Belt-and-suspenders: re-read the flag directly in case an unlock event
    // hasn't propagated yet on this first resolved render.
    if (typeof window !== 'undefined' && localStorage.getItem(FEATURE_GATE_KEY) === '1') {
      return <>{children}</>;
    }
    notFound();
  }
  return <>{children}</>;
}
