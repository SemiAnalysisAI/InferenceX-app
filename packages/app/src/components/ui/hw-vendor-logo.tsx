'use client';

import { useState } from 'react';

import { isMonochromeLogo } from '@/lib/catalog/model-logos';
import { getHwVendorLogo } from '@/lib/catalog/vendor-logos';
import { cn } from '@/lib/shared/utils';

export function HwVendorLogo({ vendor, className }: { vendor?: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const logo = getHwVendorLogo(vendor);

  if (!logo || failedSrc === logo) return null;

  return (
    <img
      src={`/logos/${logo}`}
      alt=""
      aria-hidden="true"
      className={cn(
        'inline-block h-4 w-auto max-w-12 shrink-0 object-contain align-text-bottom',
        isMonochromeLogo(logo) && 'dark:invert',
        className,
      )}
      onError={() => setFailedSrc(logo)}
    />
  );
}
