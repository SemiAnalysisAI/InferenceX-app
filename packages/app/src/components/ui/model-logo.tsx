'use client';

import { useState } from 'react';

import { getModelLogo, type Model } from '@/lib/data-mappings';
import { isMonochromeLogo } from '@/lib/model-logos';
import { cn } from '@/lib/utils';

/**
 * Small inline logo for the model creator, rendered beside the model name
 * (e.g. in the inference chart caption). Resolves the asset via
 * `getModelLogo` and renders nothing when the model has no configured logo or
 * the asset fails to load, so surrounding text never gains a broken-image box.
 *
 * Monochrome marks (black / `currentColor`, e.g. kimi, openai) are inverted
 * in dark mode so they stay visible; full-color logos (e.g. deepseek-color,
 * qwen-color) are shown as-is in both themes. The image is decorative — the
 * model name is the adjacent text — so it is hidden from assistive
 * technology.
 */
export function ModelLogo({ model, className }: { model: Model; className?: string }) {
  // Track WHICH asset failed rather than a boolean: chart sections are keyed by
  // index, so one ModelLogo instance is reused across model switches and a
  // stale boolean would keep suppressing every later model's logo after a
  // single load error.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const logo = getModelLogo(model);

  if (!logo || failedSrc === logo) return null;

  return (
    <img
      src={`/logos/${logo}`}
      alt=""
      aria-hidden="true"
      width={16}
      height={16}
      className={cn(
        'inline-block size-4 shrink-0 object-contain align-text-bottom',
        isMonochromeLogo(logo) && 'dark:invert',
        className,
      )}
      onError={() => setFailedSrc(logo)}
    />
  );
}
