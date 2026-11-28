'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { Locale } from '@/lib/i18n/i18n';

import { csgoCopy } from './csgo-strings';
import { CsgoToggles } from './csgo-toggles';

const CsgoOps = dynamic(() => import('./csgo-ops'), { ssr: false });

export type CsgoMode = 'campaign' | 'endless' | 'sandbox';

export default function CsgoGameDialog({
  locale,
  onClose,
}: {
  locale: Locale;
  onClose: () => void;
}) {
  const copy = csgoCopy(locale);
  const [mode, setMode] = useState<CsgoMode | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="csgo-ops-dialog max-w-none flex flex-col gap-2"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          const host = document.querySelector<HTMLElement>('[data-testid="csgo-ops"]');
          const sub = host?.dataset.overlay;
          if (host && sub && sub !== 'dead' && sub !== 'win') {
            host.dispatchEvent(new Event('csgo-escape'));
            return;
          }
          onClose();
        }}
        onPointerDownOutside={(event) => {
          const host = document.querySelector<HTMLElement>('[data-testid="csgo-ops"]');
          if (host && host.dataset.status === 'playing') event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.querySelector<HTMLButtonElement>('[data-testid="csgo-play"]')?.focus();
        }}
      >
        <DialogTitle>{copy.gameTitle}</DialogTitle>
        <DialogDescription className="sr-only">{copy.gameHelp}</DialogDescription>
        <div className="csgo-ops-audio">
          <CsgoToggles placement="banner" />
        </div>
        {mode ? (
          <CsgoOps locale={locale} mode={mode} onExit={onClose} />
        ) : (
          <div className="csgo-mode-pick">
            <p>{copy.gameHelp}</p>
            <button
              type="button"
              data-testid="csgo-start-campaign"
              onClick={() => setMode('campaign')}
            >
              {copy.campaign}
            </button>
            <button
              type="button"
              data-testid="csgo-start-endless"
              onClick={() => setMode('endless')}
            >
              {copy.endless}
            </button>
            <button
              type="button"
              data-testid="csgo-start-sandbox"
              onClick={() => setMode('sandbox')}
            >
              {copy.sandbox}
            </button>
            <ul>
              {copy.howLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
