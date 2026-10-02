'use client';

import { Leaf } from 'lucide-react';
import { useEffect, useState } from 'react';

import { HEADER_ACTION_STYLE } from '@/components/ui/control-styles';
import { track } from '@/lib/analytics';
import {
  AUTUMN_LEAVES_OFF_ATTRIBUTE,
  AUTUMN_LEAVES_OFF_VALUE,
  AUTUMN_LEAVES_STORAGE_KEY,
} from '@/lib/autumn-leaves';
import { cn } from '@/lib/utils';

/** Header button that shows or hides the falling autumn leaves; the choice persists. */
export function AutumnLeavesToggle({ isZh = false }: { isZh?: boolean }) {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(!document.documentElement.hasAttribute(AUTUMN_LEAVES_OFF_ATTRIBUTE));
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    const root = document.documentElement;
    if (next) root.removeAttribute(AUTUMN_LEAVES_OFF_ATTRIBUTE);
    else root.setAttribute(AUTUMN_LEAVES_OFF_ATTRIBUTE, '');
    try {
      if (next) localStorage.removeItem(AUTUMN_LEAVES_STORAGE_KEY);
      else localStorage.setItem(AUTUMN_LEAVES_STORAGE_KEY, AUTUMN_LEAVES_OFF_VALUE);
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for this page view.
    }
    track('autumn_leaves_toggled', { enabled: next });
  };

  const label = enabled
    ? isZh
      ? '隐藏飘落的树叶'
      : 'Hide falling leaves'
    : isZh
      ? '显示飘落的树叶'
      : 'Show falling leaves';

  return (
    <button
      type="button"
      data-testid="autumn-leaves-toggle"
      className={cn(HEADER_ACTION_STYLE, 'size-11', !enabled && 'opacity-60')}
      aria-label={label}
      aria-pressed={enabled}
      title={label}
      onClick={toggle}
    >
      <span className="relative">
        <Leaf size={18} aria-hidden="true" className={enabled ? 'text-orange-600' : undefined} />
        {!enabled && (
          <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <span className="block h-[2px] w-[22px] rotate-45 bg-current" />
          </span>
        )}
      </span>
    </button>
  );
}
