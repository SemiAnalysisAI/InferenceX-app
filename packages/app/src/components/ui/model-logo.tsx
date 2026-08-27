'use client';

import { useState } from 'react';

import { getModelLogo, type Model } from '@/lib/data-mappings';
import { cn } from '@/lib/utils';

/**
 * Small inline logo for the model creator, rendered beside the model name
 * (e.g. in the inference chart caption). Resolves the asset via
 * `getModelLogo` and renders nothing when the model has no configured logo or
 * the asset fails to load, so surrounding text never gains a broken-image box.
 *
 * Monochrome SVG marks (black / `currentColor`, e.g. moonshot-ai, deepseek)
 * are inverted in dark mode so they stay visible; colored raster logos
 * (`.webp`, e.g. qwen, zhipu) are shown as-is in both themes. The image is
 * decorative — the model name is the adjacent text — so it is hidden from
 * assistive technology.
 */
export function ModelLogo({ model, className }: { model: Model; className?: string }) {
  const [failed, setFailed] = useState(false);
  const logo = getModelLogo(model);

  if (!logo || failed) return null;

  return (
    <img
      src={`/logos/${logo}`}
      alt=""
      aria-hidden="true"
      width={16}
      height={16}
      className={cn(
        'inline-block size-4 shrink-0 object-contain align-text-bottom',
        logo.endsWith('.svg') && 'dark:invert',
        className,
      )}
      onError={() => setFailed(true)}
    />
  );
}
