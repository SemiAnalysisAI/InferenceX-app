'use client';

import { track } from '@/lib/analytics';
import { Check, Link as LinkIcon } from 'lucide-react';
import { useCallback, useState } from 'react';

import { buildShareUrl } from '@/lib/url-state';

import { Button } from './button';

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const url = buildShareUrl();
    track('share_link_copied');

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }

    // Dispatch action event for post-action star prompt
    window.dispatchEvent(new CustomEvent('inferencex:action'));
  }, []);

  return (
    <Button
      data-testid="share-button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="h-7 gap-1.5 text-xs"
      title="Copy share link to clipboard"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" />
          Copied
        </>
      ) : (
        <>
          <LinkIcon className="h-3 w-3" />
          Share
        </>
      )}
    </Button>
  );
}
