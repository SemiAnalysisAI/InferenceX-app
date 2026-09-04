'use client';

import { AlertTriangle, ExternalLink, X } from 'lucide-react';

import { track } from '@/lib/analytics';
import { overlayRunColor } from '@/lib/overlay-run-style';
import { cn } from '@/lib/utils';

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
  /** Join the bottom edge of the dashboard navigation card. */
  attached?: boolean;
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
export function UnofficialBanner({
  runs,
  attached = false,
  onDismissRun,
  onDismissAll,
}: UnofficialBannerProps) {
  if (runs.length === 0) return null;
  const multiple = runs.length > 1;

  const banner = (
    <div
      data-slot="unofficial-banner"
      className={cn(
        'min-w-0 border-red-500/60 bg-red-600 px-4 py-3 text-white md:px-6',
        attached ? 'rounded-b-xl border-t' : 'rounded-xl border',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold">
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            NON-OFFICIAL
          </span>
          <span className="text-xs text-white/90">
            {multiple ? `Viewing ${runs.length} runs` : 'Viewing data from branch'}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-2 sm:basis-auto">
          {runs.map((run, idx) => (
            <RunChip
              key={run.id}
              run={run}
              color={overlayRunColor(idx)}
              onDismiss={onDismissRun ? () => onDismissRun(String(run.id)) : undefined}
            />
          ))}
        </div>
        {multiple && onDismissAll && (
          <button
            type="button"
            onClick={() => {
              track('unofficial_banner_dismissed_all', { count: runs.length });
              onDismissAll();
            }}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current sm:ml-auto sm:min-h-8"
            aria-label="Dismiss all unofficial runs"
          >
            <X className="size-3" />
            Dismiss all
          </button>
        )}
      </div>
    </div>
  );

  // Compare and model pages render the standalone banner outside their own
  // content containers, so it needs the same width and page gutters here.
  return attached ? banner : <div className="container mx-auto mb-4 px-4 lg:px-8">{banner}</div>;
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
    <span className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-md border border-white/20 bg-red-950/25 pl-2 text-xs font-mono">
      <span
        aria-hidden
        className="inline-block size-2 shrink-0 rounded-full border border-white/40"
        style={{ backgroundColor: color }}
      />
      <a
        href={run.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('unofficial_banner_view_run', { branch: run.branch })}
        className="inline-flex min-h-11 min-w-0 items-center gap-1.5 py-1 underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current sm:min-h-7"
        aria-label={`View workflow run for ${run.branch}`}
      >
        <span className="min-w-0 [overflow-wrap:anywhere]">{run.branch}</span>
        <ExternalLink aria-hidden className="size-3 shrink-0 opacity-70" />
      </a>
      {onDismiss && (
        <button
          type="button"
          onClick={() => {
            track('unofficial_banner_run_dismissed', { branch: run.branch });
            onDismiss();
          }}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current sm:size-7"
          aria-label={`Dismiss ${run.branch}`}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}
