'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  formatNumber,
  formatDuration,
  formatInteractivity,
  formatPrefillSpeed,
  computePrefillSpeed,
  formatJsonCompact,
} from '@/lib/agentic-workload-explorer/format';
import { useSession } from '@/lib/agentic-workload-explorer/session-context';
import { formatSnapshotTime } from '@/lib/agentic-workload-explorer/snapshot';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';

const STRINGS = {
  en: {
    title: 'Raw Request Trace',
    description: 'Click a request to expand its details',
    requestHeaders: 'Request Headers',
    requestBody: 'Request Body',
    responseBody: 'Response Body',
    error: 'Error',
  },
  zh: {
    title: '原始请求 Trace',
    description: '点击请求查看详情',
    requestHeaders: '请求头',
    requestBody: '请求体',
    responseBody: '响应体',
    error: '错误',
  },
};

export default function RawTracePage() {
  const t = STRINGS[useLocale()];
  const { requests } = useSession();
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.title}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.map((req) => {
          const isExpanded = expandedRequest === req.id;
          return (
            <div
              key={req.id}
              className="rounded-md border border-border bg-surface overflow-hidden"
            >
              <button
                onClick={() => {
                  const next = isExpanded ? null : req.id;
                  track('agentic_workload_raw_request_toggled', { expanded: next !== null });
                  setExpandedRequest(next);
                }}
                className={`w-full flex items-center justify-between py-2.5 px-3 text-sm transition-colors text-left ${
                  isExpanded ? 'bg-surface-hover' : 'hover:bg-surface-hover'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant={req.responseStatusCode === 200 ? 'default' : 'destructive'}
                    className="font-mono text-xs"
                  >
                    {req.responseStatusCode || 'ERR'}
                  </Badge>
                  <span className="font-mono text-xs">{req.model || 'unknown'}</span>
                  {has1MContext(req.requestHeaders) && (
                    <Badge
                      variant="outline"
                      className="text-xs py-0 h-5 border-sky-500/30 text-sky-400 font-mono"
                    >
                      1M
                    </Badge>
                  )}
                  {req.isStreaming && (
                    <Badge variant="outline" className="text-xs">
                      stream
                    </Badge>
                  )}
                  {req.error && (
                    <Badge variant="destructive" className="text-xs">
                      error
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {req.inputTokens !== null && (
                    <span>
                      {formatNumber(req.inputTokens)} in
                      {(req.cacheReadInputTokens ?? 0) > 0 &&
                        ` · ${formatNumber(req.cacheReadInputTokens!)} cache_read`}
                      {(req.cacheWriteTokens ?? 0) > 0 &&
                        ` · ${formatNumber(req.cacheWriteTokens!)} cache_write`}
                      {` · ${formatNumber(req.outputTokens || 0)} out`}
                    </span>
                  )}
                  {req.ttftMs !== null && <span>TTFT {formatDuration(req.ttftMs)}</span>}
                  {(() => {
                    const ps = computePrefillSpeed(
                      req.cacheReadInputTokens,
                      req.cacheWriteTokens,
                      req.ttftMs,
                    );
                    return ps === null ? null : (
                      <span className="text-sky-500">{formatPrefillSpeed(ps)}</span>
                    );
                  })()}
                  {req.tpotMs !== null && <span>{formatInteractivity(req.tpotMs)}</span>}
                  {req.durationMs !== null && <span>E2E {formatDuration(req.durationMs)}</span>}
                  <span>{formatSnapshotTime(req.timestamp)}</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border px-4 py-3 space-y-4">
                  <div role="separator" className="h-px w-full shrink-0 bg-border" />
                  {req.requestHeaders && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-2">
                        {t.requestHeaders}
                      </h4>
                      <pre className="text-xs font-mono bg-muted/50 rounded-md p-3 overflow-x-auto max-h-96 overflow-y-auto">
                        {formatJsonCompact(req.requestHeaders)}
                      </pre>
                    </div>
                  )}
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">
                      {t.requestBody}
                    </h4>
                    <pre className="text-xs font-mono bg-muted/50 rounded-md p-3 overflow-x-auto max-h-96 overflow-y-auto">
                      {formatJsonCompact(req.requestBody)}
                    </pre>
                  </div>
                  {req.responseBody && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-2">
                        {t.responseBody}
                      </h4>
                      <pre className="text-xs font-mono bg-muted/50 rounded-md p-3 overflow-x-auto max-h-96 overflow-y-auto">
                        {formatJsonCompact(req.responseBody)}
                      </pre>
                    </div>
                  )}
                  {req.error && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-2">{t.error}</h4>
                      <pre className="text-xs font-mono text-destructive bg-destructive/10 rounded-md p-3">
                        {req.error}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function has1MContext(headers: Record<string, string> | null): boolean {
  if (!headers) return false;
  const beta = headers['anthropic-beta'] || '';
  return beta.includes('context-1m-');
}
