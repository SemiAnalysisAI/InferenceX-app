'use client';

import { useState } from 'react';

export function CompanyLogo({ org, logo }: { org: string; logo?: string }) {
  const [failed, setFailed] = useState(false);

  if (!logo || failed) {
    return (
      <div className="size-10 shrink-0 rounded-full bg-muted flex items-center justify-center">
        <span className="text-sm font-bold text-muted-foreground">
          {org
            .split(' ')
            .map((w) => w[0])
            .join('')}
        </span>
      </div>
    );
  }

  return (
    <img
      src={`/logos/${logo}`}
      alt={org}
      width={80}
      height={40}
      className="h-10 min-w-10 max-w-20 shrink-0 object-contain grayscale opacity-70 dark:invert"
      onError={() => setFailed(true)}
    />
  );
}

export function highlightBrand(text: string) {
  const parts = text.split(/(InferenceMAX™?|InferenceX™?|InferenceMAX|InferenceX)/gi);
  return parts.map((part, i) =>
    /^inference(max|x)/i.test(part) ? (
      <span key={i} className="text-brand font-semibold">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
