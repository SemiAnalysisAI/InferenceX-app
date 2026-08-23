'use client';

import { useCallback, useRef, useState } from 'react';
import { LinkIcon } from 'lucide-react';
import { track } from '@/lib/analytics';

export function HeadingLink({ id }: { id: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'fading'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      clearTimeout(timerRef.current);
      const url = `${window.location.origin}${window.location.pathname}#${id}`;
      navigator.clipboard.writeText(url).then(
        () => {
          track('blog_heading_link_copied', { id });
          setState('copied');
          timerRef.current = setTimeout(() => {
            setState('fading');
            timerRef.current = setTimeout(() => setState('idle'), 300);
          }, 2000);
        },
        () => {
          /* clipboard denied — silent fallback */
        },
      );
    },
    [id],
  );

  const visible = state !== 'idle';

  return (
    <a
      href={`#${id}`}
      onClick={handleClick}
      aria-label="Copy link to section"
      className={`inline-flex items-center ml-2 no-underline transition-opacity duration-300 text-muted-foreground hover:text-foreground ${visible ? (state === 'fading' ? 'opacity-0' : 'opacity-100') : 'opacity-0 group-hover:opacity-100'}`}
    >
      {state === 'idle' ? (
        <LinkIcon className="size-4" />
      ) : (
        <span className="text-xs">Link copied</span>
      )}
    </a>
  );
}
