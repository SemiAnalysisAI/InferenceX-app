'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';

const STRINGS = {
  en: {
    exitFullscreen: 'Exit fullscreen',
    expandChart: 'Expand chart',
  },
  zh: {
    exitFullscreen: '退出全屏',
    expandChart: '展开图表',
  },
} as const;

export function ExpandableChart({
  title,
  subtitle,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = STRINGS[useLocale()];
  const [expanded, setExpanded] = useState(false);

  const close = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    if (!expanded) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [expanded, close]);

  // Prevent body scroll when expanded
  useEffect(() => {
    document.body.style.overflow = expanded ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [expanded]);

  const expandButton = (
    <button
      onClick={() => {
        const next = !expanded;
        setExpanded(next);
        track('agentic_workload_chart_expand_toggled', { expanded: next });
      }}
      className="text-subtle hover:text-foreground p-0.5 rounded hover:bg-surface-hover transition-colors"
      aria-label={expanded ? t.exitFullscreen : t.expandChart}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="w-3.5 h-3.5"
      >
        {expanded ? (
          <>
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </>
        ) : (
          <>
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </>
        )}
      </svg>
    </button>
  );

  if (expanded) {
    return (
      <>
        {/* Placeholder to keep grid layout stable */}
        <Card className="invisible" aria-hidden>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: 200 }} />
          </CardContent>
        </Card>

        {/* Fullscreen overlay */}
        <div
          className="fixed inset-0 z-50 bg-background/95 flex flex-col"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="flex items-center justify-between px-6 py-3 border-b border-border">
            <div>
              <div className="text-sm font-medium">{title}</div>
              {subtitle && <div className="text-3xs font-mono text-subtle mt-0.5">{subtitle}</div>}
            </div>
            <div className="flex items-center gap-2">{expandButton}</div>
          </div>
          <div className="flex-1 overflow-auto p-6 [&_svg]:!max-h-[calc(100vh-220px)]">
            {children}
          </div>
        </div>
      </>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            {subtitle && <div className="text-3xs font-mono text-subtle mt-0.5">{subtitle}</div>}
          </div>
          {expandButton}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
