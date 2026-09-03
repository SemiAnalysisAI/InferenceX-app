'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

import { track } from '@/lib/analytics';
import type { Locale } from '@/lib/i18n';

const STRINGS = {
  en: {
    code: 'Code',
    copy: 'Copy',
    copied: 'Copied',
    failed: 'Could not copy. Select the code to copy it manually.',
    scroll: 'Scroll to inspect the full example.',
  },
  zh: {
    code: '代码',
    copy: '复制',
    copied: '已复制',
    failed: '复制失败。请选中代码后手动复制。',
    scroll: '滚动查看完整示例。',
  },
} as const;

/** A bounded reader, not a truncated preview: copy always includes every byte. */
export function CopyableCodeBlock({
  children,
  locale,
  label,
}: {
  children: string;
  locale: Locale;
  label?: string;
}) {
  const t = STRINGS[locale];
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const title = label ?? t.code;
  const tall = children.split('\n').length > 12;

  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setStatus('copied');
      track('code_example_copied', { label: title });
    } catch {
      setStatus('failed');
    }
  }

  return (
    <div
      data-testid="copyable-code-block"
      className="min-w-0 overflow-hidden rounded-lg border border-border/60 bg-muted/30"
    >
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border/50 px-3 py-1">
        <span className="min-w-0 break-words text-xs font-medium text-muted-foreground">
          {title}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={`${t.copy}: ${title}`}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none sm:min-h-8"
        >
          {status === 'copied' ? (
            <Check aria-hidden="true" className="size-3.5" />
          ) : (
            <Copy aria-hidden="true" className="size-3.5" />
          )}
          <span aria-live="polite">{status === 'copied' ? t.copied : t.copy}</span>
        </button>
      </div>
      <pre
        tabIndex={0}
        role="region"
        aria-label={title}
        className="max-h-96 overflow-auto overscroll-contain p-4 text-xs leading-6 text-foreground focus-visible:outline-none"
      >
        <code>{children}</code>
      </pre>
      {tall && (
        <p className="border-t border-border/50 px-3 py-2 text-xs text-muted-foreground">
          {t.scroll}
        </p>
      )}
      {status === 'failed' && (
        <p role="status" className="px-3 pb-3 text-xs text-destructive">
          {t.failed}
        </p>
      )}
    </div>
  );
}
