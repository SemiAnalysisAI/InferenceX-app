'use client';

import { useState } from 'react';

import { SupporterLogoImage } from './supporter-logo-image';

export function CompanyLogo({ org, logo }: { org: string; logo?: string }) {
  const [failed, setFailed] = useState(false);

  if (!logo || failed) {
    return (
      <div className="size-10 shrink-0 rounded-full bg-muted flex items-center justify-center">
        <span className="text-sm font-medium text-muted-foreground">
          {org
            .split(' ')
            .map((w) => w[0])
            .join('')}
        </span>
      </div>
    );
  }

  return (
    <SupporterLogoImage
      logo={logo}
      alt={org}
      width={80}
      height={40}
      className="h-10 min-w-10 max-w-20 shrink-0 object-contain object-left"
      darkClassName="dark:opacity-70 dark:grayscale dark:invert"
      onError={() => setFailed(true)}
    />
  );
}
