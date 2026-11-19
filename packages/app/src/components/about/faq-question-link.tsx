'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, LinkIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';

const STRINGS = {
  en: {
    copyLink: 'Copy link',
    copied: 'Copied',
  },
  zh: {
    copyLink: '复制链接',
    copied: '已复制',
  },
} as const;

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.append(textArea);
    textArea.select();
    document.execCommand('copy');
    textArea.remove();
  }
}

export function FaqQuestionLink({ id, question }: { id: string; question: string }) {
  const locale = useLocale();
  const strings = STRINGS[locale];
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleCopy = useCallback(async () => {
    const url = new URL(window.location.href);
    url.hash = id;
    await copyText(url.toString());
    track('about_faq_link_copied', { id });
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [id]);

  return (
    <span className="flex items-start justify-between gap-3">
      <a
        href={`#${id}`}
        onClick={() => track('about_faq_link_clicked', { id })}
        className="min-w-0 flex-1 rounded-sm transition-colors hover:text-brand focus-visible:outline-none"
      >
        {question}
      </a>
      <Button
        type="button"
        variant="ghost"
        size="icon-2xs"
        data-testid={`faq-copy-link-${id}`}
        aria-label={`${copied ? strings.copied : strings.copyLink}: ${question}`}
        title={copied ? strings.copied : strings.copyLink}
        onClick={() => void handleCopy()}
        className="-my-0.5 text-muted-foreground hover:text-foreground"
      >
        {copied ? (
          <Check aria-hidden="true" className="size-4" />
        ) : (
          <LinkIcon aria-hidden="true" className="size-4" />
        )}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? `${strings.copied}: ${question}` : ''}
      </span>
    </span>
  );
}
