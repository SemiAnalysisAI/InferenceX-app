'use client';

import { useState } from 'react';

import { isMonochromeLogo } from '@/lib/catalog/model-logos';
import { getHwVendorDarkLogo, getHwVendorLogo } from '@/lib/catalog/vendor-logos';
import { cn } from '@/lib/shared/utils';

const LOGO_CLASS = 'h-4 w-auto max-w-12 shrink-0 object-contain align-text-bottom';

export function HwVendorLogo({ vendor, className }: { vendor?: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const logo = getHwVendorLogo(vendor);
  const darkLogo = getHwVendorDarkLogo(vendor);

  if (!logo || failedSrc === logo) return null;

  return (
    <>
      <img
        src={`/logos/${logo}`}
        alt=""
        aria-hidden="true"
        className={cn(
          'inline-block',
          LOGO_CLASS,
          darkLogo ? 'dark:hidden' : isMonochromeLogo(logo) && 'dark:invert',
          className,
        )}
        onError={() => setFailedSrc(logo)}
      />
      {darkLogo && (
        <img
          src={`/logos/${darkLogo}`}
          alt=""
          aria-hidden="true"
          className={cn('hidden dark:inline-block', LOGO_CLASS, className)}
          onError={() => setFailedSrc(logo)}
        />
      )}
    </>
  );
}
