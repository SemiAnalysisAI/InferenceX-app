'use client';

import { useState } from 'react';

import { getModelLogo, type Model } from '@/lib/catalog/data-mappings';
import { isMonochromeLogo } from '@/lib/catalog/model-logos';
import { cn } from '@/lib/shared/utils';

export function ModelLogo({ model, className }: { model: Model; className?: string }) {
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
