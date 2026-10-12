'use client';

import { createContext, useContext } from 'react';

export interface SessionRequest {
  id: string;
  timestamp: string;
  method: string;
  endpoint: string;
  model: string | null;
  requestBody: Record<string, unknown> | null;
  responseBody: Record<string, unknown> | null;
  responseStatusCode: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheWriteTokens: number | null;
  cacheReadInputTokens: number | null;
  durationMs: number | null;
  ttftMs: number | null;
  tpotMs: number | null;
  isStreaming: boolean;
  isFastMode: boolean | null;
  hashIds: string[] | null;
  /** Block count when hashIds weren't loaded (fetched on demand instead). */
  hashCount?: number;
  hashTokenCount: number | null;
  privacyMode: 'anon' | 'full';
  subagentLabel: string | null;
  costUsd: number | null;
  requestHeaders: Record<string, string> | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
}

export interface SessionData {
  session: {
    id: string;
    clientId: string;
    startedAt: string;
    lastActiveAt: string;
    metadata: {
      userAgent?: string;
      cliVersion?: string;
      os?: string;
      arch?: string;
      nodeVersion?: string;
    } | null;
    clientApiKeyHash: string;
    privacyMode: 'anon' | 'full';
    minTraceVersion: number | null;
    maxTraceVersion: number | null;
    usage: {
      requestCount: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCacheCreation: number;
      totalCacheRead: number;
      totalCost: number;
    };
  };
  requests: SessionRequest[];
  total: number;
  loadUntil: (requestIndex: number) => Promise<void>;
  reversed: boolean;
  setReversed: (reversed: boolean) => void;
}

const SessionContext = createContext<SessionData | null>(null);

export function SessionProvider({
  value,
  children,
}: {
  value: SessionData;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionData {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
