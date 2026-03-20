'use client';

import { useState } from 'react';

export function CompanyLogo({ company, logo }: { company: string; logo?: string }) {
  const [failed, setFailed] = useState(false);

  if (!logo || failed) {
    return (
      <div className="h-12 shrink-0 rounded-full bg-muted flex items-center justify-center px-3">
        <span className="text-xs font-bold text-muted-foreground">{company[0]}</span>
      </div>
    );
  }

  return (
    <img
      src={`/logos/${logo}`}
      alt={company}
      className="h-10 min-w-10 max-w-20 shrink-0 object-contain grayscale opacity-70 dark:invert"
      onError={() => setFailed(true)}
    />
  );
}

export function highlightBrand(text: string) {
  const parts = text.split(/(InferenceMAX™?|InferenceX™?|InferenceMAX|InferenceX)/gi);
  return parts.map((part, i) =>
    /^inference(max|x)/i.test(part) ? (
      <span key={i} className="text-secondary dark:text-primary font-semibold">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
