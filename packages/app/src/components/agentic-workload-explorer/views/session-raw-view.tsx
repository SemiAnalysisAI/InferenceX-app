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
import {
  ShowMoreRows,
  useRowLimit,
} from '@/components/agentic-workload-explorer/conversation-view';
import { formatSnapshotTime } from '@/lib/agentic-workload-explorer/snapshot';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';

const STRINGS = {
  en: {
    title: 'Raw request trace',
    description: 'Click a request to expand its details',
    requestHeaders: 'Request headers',
    requestBody: 'Request body',
    responseBody: 'Response body',
    error: 'Error',
    tokensIn: 'in',
    tokensOut: 'out',
    cacheRead: 'cache read',
    cacheWrite: 'cache write',
    stream: 'stream',
    errorBadge: 'error',
    unknownModel: 'unknown',
  },
  zh: {
    title: '原始请求 Trace',
    description: '点击请求查看详情',
    requestHeaders: '请求头',
    requestBody: '请求体',
    responseBody: '响应体',
    error: '错误',
    tokensIn: '输入',
    tokensOut: '输出',
    cacheRead: '缓存读取',
    cacheWrite: '缓存写入',
    stream: '流式',
    errorBadge: '错误',
    unknownModel: '未知',
  },
};

export default function RawTracePage() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { requests } = useSession();
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const [rowLimit, , showMoreRows] = useRowLimit();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription className="text-xs">{t.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.slice(0, rowLimit).map((req) => {
          const isExpanded = expandedRequest === req.id;
          return (
            <div
              key={req.id}
              className="rounded-xl border border-border/30 bg-card overflow-hidden"
            >
              <button
                onClick={() => {
                  const next = isExpanded ? null : req.id;
                  track('agentic_workload_raw_request_toggled', { enabled: next !== null });
                  setExpandedRequest(next);
                }}
                className={`w-full flex items-center justify-between py-2.5 px-3 text-sm transition-colors text-left ${
                  isExpanded ? 'bg-surface-hover' : 'hover:bg-surface-hover'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant={req.responseStatusCode === 200 ? 'default' : 'destructive'}
                    className="tabular-nums text-xs"
                  >
                    {req.responseStatusCode || 'ERR'}
                  </Badge>
                  <span className="text-xs">{req.model || t.unknownModel}</span>
                  {has1MContext(req.requestHeaders) && (
                    <Badge variant="outline" className="text-xs py-0 h-5 tabular-nums">
                      1M
                    </Badge>
                  )}
                  {req.isStreaming && (
                    <Badge variant="outline" className="text-xs">
                      {t.stream}
                    </Badge>
                  )}
                  {req.error && (
                    <Badge variant="destructive" className="text-xs">
                      {t.errorBadge}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs tabular-nums text-muted-foreground">
                  {req.inputTokens !== null && (
                    <span>
                      {formatNumber(req.inputTokens)} {t.tokensIn}
                      {(req.cacheReadInputTokens ?? 0) > 0 &&
                        ` · ${formatNumber(req.cacheReadInputTokens!)} ${t.cacheRead}`}
                      {(req.cacheWriteTokens ?? 0) > 0 &&
                        ` · ${formatNumber(req.cacheWriteTokens!)} ${t.cacheWrite}`}
                      {` · ${formatNumber(req.outputTokens || 0)} ${t.tokensOut}`}
                    </span>
                  )}
                  {req.ttftMs !== null && <span>TTFT {formatDuration(req.ttftMs)}</span>}
                  {(() => {
                    const ps = computePrefillSpeed(
                      req.cacheReadInputTokens,
                      req.cacheWriteTokens,
                      req.ttftMs,
                    );
                    return ps === null ? null : <span>{formatPrefillSpeed(ps)}</span>;
                  })()}
                  {req.tpotMs !== null && <span>{formatInteractivity(req.tpotMs)}</span>}
                  {req.durationMs !== null && <span>E2E {formatDuration(req.durationMs)}</span>}
                  <span>{formatSnapshotTime(req.timestamp, locale)}</span>
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
                <div className="border-t border-border/20 px-4 py-3 space-y-4">
                  <div role="separator" className="h-px w-full shrink-0 bg-border/30" />
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
        <ShowMoreRows
          shown={Math.min(rowLimit, requests.length)}
          total={requests.length}
          view="raw"
          onShowMore={showMoreRows}
        />
      </CardContent>
    </Card>
  );
}

function has1MContext(headers: Record<string, string> | null): boolean {
  if (!headers) return false;
  const beta = headers['anthropic-beta'] || '';
  return beta.includes('context-1m-');
}
