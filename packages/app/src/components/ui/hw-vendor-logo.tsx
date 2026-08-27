'use client';

import { useState } from 'react';

import { isMonochromeLogo } from '@/lib/model-logos';
import { getHwVendorLogo } from '@/lib/vendor-logos';
import { cn } from '@/lib/utils';

/**
 * Small inline hardware-vendor mark, rendered beside a GPU label (e.g. in the
 * `/compare` pair cards). Resolves the asset via `getHwVendorLogo` and renders
 * nothing when the vendor has no configured logo or the asset fails to load,
 * so surrounding text never gains a broken-image box.
 *
 * Full-color marks (NVIDIA green) render as-is in both themes; monochrome
 * marks (AMD — black / reversed-white only per brand guidelines) get the
 * shared dark-mode invert. The image is decorative — the hardware label is
 * the adjacent text — so it is hidden from assistive technology.
 */
export function HwVendorLogo({ vendor, className }: { vendor?: string; className?: string }) {
  // Track WHICH asset failed rather than a boolean, mirroring ModelLogo: a
  // reused instance should not suppress a different vendor's logo after one
  // load error.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const logo = getHwVendorLogo(vendor);

  if (!logo || failedSrc === logo) return null;

  return (
    <img
      src={`/logos/${logo}`}
      alt=""
      aria-hidden="true"
      className={cn(
        // Height-bounded with natural aspect ratio: the NVIDIA eye mark is
        // square-ish while the AMD lockup is a wide wordmark; max-w keeps the
        // wordmark from crowding the card title.
        'inline-block h-4 w-auto max-w-12 shrink-0 object-contain align-text-bottom',
        isMonochromeLogo(logo) && 'dark:invert',
        className,
      )}
      onError={() => setFailedSrc(logo)}
    />
  );
}
