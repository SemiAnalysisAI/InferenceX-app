'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

/** First `initial` items, with a button to show the rest. */
export function useShowMore<T>(items: T[], initial: number) {
  const [all, setAll] = useState(false);
  const visible = all ? items : items.slice(0, initial);
  const toggle =
    items.length > initial ? (
      <Button type="button" size="sm" variant="ghost" onClick={() => setAll(!all)}>
        {all ? 'Show fewer' : `Show all ${items.length}`}
      </Button>
    ) : null;
  return { visible, toggle };
}
