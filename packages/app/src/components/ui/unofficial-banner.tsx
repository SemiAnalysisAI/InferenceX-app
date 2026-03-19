'use client';

import { AlertTriangle, ExternalLink, X } from 'lucide-react';

import { track } from '@/lib/analytics';

interface UnofficialBannerProps {
  runInfo: {
    id: number;
    name: string;
    branch: string;
    sha: string;
    createdAt: string;
    url: string;
  };
  onDismiss?: () => void;
}

export function UnofficialBanner({ runInfo, onDismiss }: UnofficialBannerProps) {
  return (
    <div className="bg-red-600 text-white px-4 py-3 relative">
      <div className="container mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 flex-shrink-0" />
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-xl font-bold tracking-wide">NON-OFFICIAL</span>
            <span className="text-sm opacity-90">
              Viewing data from branch:{' '}
              <code className="bg-red-700 px-1.5 py-0.5 rounded text-xs font-mono">
                {runInfo.branch}
              </code>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={runInfo.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('unofficial_banner_view_run', { branch: runInfo.branch })}
            className="flex items-center gap-1 text-sm bg-red-700 hover:bg-red-800 px-3 py-1.5 rounded transition-colors"
          >
            View Run
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {onDismiss && (
            <button
              onClick={() => {
                track('unofficial_banner_dismissed', { branch: runInfo.branch });
                onDismiss?.();
              }}
              className="p-1.5 hover:bg-red-700 rounded transition-colors"
              aria-label="Dismiss banner"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
