'use client';

import { AlertTriangle, ExternalLink, X } from 'lucide-react';

import { track } from '@/lib/analytics';
import { overlayRunColor } from '@/lib/overlay-run-style';

interface RunInfo {
  id: number;
  name: string;
  branch: string;
  sha: string;
  createdAt: string;
  url: string;
}

interface UnofficialBannerProps {
  runs: RunInfo[];
  /** Remove a single run from the URL + state. */
  onDismissRun?: (runId: string) => void;
  /** Clear all runs at once. Surfaced as "Dismiss all" when `runs.length > 1`. */
  onDismissAll?: () => void;
}

/**
 * Compact banner that advertises that the page is showing unofficial run data.
 *
 * When multiple runs are loaded, each gets a chip with a color swatch (matching
 * the chart's per-run color from {@link overlayRunColor}), a link to the
 * workflow run, and its own dismiss `×`. A single "Dismiss all" button is
 * rendered at the right edge when more than one run is loaded. Previously each
 * run rendered its OWN full-width banner and the dismiss button cleared every
 * run, which both wasted vertical space and made partial dismissal impossible.
 */
export function UnofficialBanner({ runs, onDismissRun, onDismissAll }: UnofficialBannerProps) {
  if (runs.length === 0) return null;
  const multiple = runs.length > 1;

  return (
    <div className="bg-red-600 text-white px-4 py-2 relative">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-start gap-3 min-w-0">
          <AlertTriangle className="size-5 flex-shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold tracking-wide">NON-OFFICIAL</span>
              <span className="text-xs opacity-90">
                {multiple ? `Viewing ${runs.length} runs` : 'Viewing data from branch'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {runs.map((run, idx) => (
                <RunChip
                  key={run.id}
                  run={run}
                  color={overlayRunColor(idx)}
                  onDismiss={onDismissRun ? () => onDismissRun(String(run.id)) : undefined}
                />
              ))}
            </div>
          </div>
        </div>
        {multiple && onDismissAll && (
          <button
            onClick={() => {
              track('unofficial_banner_dismissed_all', { count: runs.length });
              onDismissAll();
            }}
            className="text-xs px-2 py-1 rounded hover:bg-red-700 transition-colors flex items-center gap-1 self-start"
            aria-label="Dismiss all unofficial runs"
          >
            <X className="size-3" />
            Dismiss all
          </button>
        )}
      </div>
    </div>
  );
}

function RunChip({
  run,
  color,
  onDismiss,
}: {
  run: RunInfo;
  color: string;
  onDismiss?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-red-700 rounded px-2 py-0.5 text-xs font-mono">
      <span
        aria-hidden
        className="inline-block rounded-full size-2 border border-red-900"
        style={{ backgroundColor: color }}
      />
      <a
        href={run.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('unofficial_banner_view_run', { branch: run.branch })}
        className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
        aria-label={`View workflow run for ${run.branch}`}
      >
        <span>{run.branch}</span>
        <ExternalLink className="size-3 opacity-70" />
      </a>
      {onDismiss && (
        <button
          onClick={() => {
            track('unofficial_banner_run_dismissed', { branch: run.branch });
            onDismiss();
          }}
          className="inline-flex items-center rounded-sm hover:bg-red-800 transition-colors ml-0.5"
          aria-label={`Dismiss ${run.branch}`}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}
