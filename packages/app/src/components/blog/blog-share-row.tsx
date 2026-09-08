'use client';

import { Check, Link as LinkIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ShareLinkedInButton, ShareTwitterButton } from '@/components/share-buttons';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

interface BlogShareRowProps {
  /** Post title, used as the pre-filled X post text. */
  title: string;
  slug: string;
  labels: { share: string; copyLink: string; copied: string };
  className?: string;
}

/** X, LinkedIn, and copy-link actions for a post. Keeps the existing share test ids. */
export function BlogShareRow({ title, slug, labels, className }: BlogShareRowProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    const url = window.location.href.split('#')[0];
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard access can be denied; the URL is still in the address bar.
    }
    track('blog_link_copied', { slug });
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [slug]);

  return (
    <div
      className={cn('flex flex-wrap items-center gap-2 text-sm text-muted-foreground', className)}
      data-testid="blog-share-row"
    >
      <span className="mr-1 font-medium text-foreground">{labels.share}</span>
      <ShareTwitterButton text={title} />
      <ShareLinkedInButton />
      <Button
        variant="outline"
        size="icon"
        className={cn('size-7', copied && 'text-brand')}
        title={copied ? labels.copied : labels.copyLink}
        aria-label={copied ? labels.copied : labels.copyLink}
        data-testid="blog-copy-link"
        onClick={copy}
      >
        {copied ? <Check className="size-3.5" /> : <LinkIcon className="size-3.5" />}
      </Button>
      <span className="text-xs" aria-live="polite">
        {copied ? labels.copied : ''}
      </span>
    </div>
  );
}
