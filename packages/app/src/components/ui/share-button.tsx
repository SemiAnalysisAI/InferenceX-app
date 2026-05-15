'use client';

import { Check, Copy, Share2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ShareLinkedInButton, ShareTwitterButton } from '@/components/share-buttons';
import { track } from '@/lib/analytics';
import { buildShareUrl } from '@/lib/url-state';

import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export function ShareButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const next = buildShareUrl();
    setUrl(next);
    setCopied(false);
    track('share_popover_opened');
    // Auto-select the URL so Cmd/Ctrl+C just works.
    queueMicrotask(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [open]);

  const handleCopy = useCallback(async () => {
    const target = url || buildShareUrl();
    track('share_link_copied');

    try {
      await navigator.clipboard.writeText(target);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = target;
      document.body.append(textArea);
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    window.dispatchEvent(new CustomEvent('inferencex:action'));
  }, [url]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          data-testid="share-button"
          size="sm"
          className="h-8 gap-1.5 bg-brand text-primary-foreground hover:bg-brand/90 text-xs font-medium"
          title="Share this view"
        >
          <Share2 className="size-3.5" />
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80"
        data-testid="share-popover"
        onOpenAutoFocus={(event) => {
          // Keep focus on the URL input rather than the first focusable child.
          event.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }}
      >
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold">Share this view</h4>
            <p className="text-muted-foreground text-xs mt-0.5">
              Anyone with this link will see your current selections and filters.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              data-testid="share-url-input"
              readOnly
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              className="border-input bg-background h-8 flex-1 min-w-0 rounded-md border px-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              data-testid="share-copy-button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs shrink-0"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="size-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-muted-foreground text-xs">Or share on</span>
            <div className="flex items-center gap-1.5">
              <ShareTwitterButton />
              <ShareLinkedInButton />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
