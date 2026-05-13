'use client';

import { Eye, EyeOff, KeyRound, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { utf8ToBytes } from '@noble/ciphers/utils.js';

import {
  type Cipher,
  type CipherKey,
  createCipher,
  parseKey,
} from '@semianalysisai/inferencex-db/lib/encryption';

import { useFeedbackList } from '@/hooks/api/use-feedback-list';
import type { FeedbackListRow } from '@/lib/api';
import { track } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const FEATURE_GATE_KEY = 'inferencex-feature-gate';

interface DecryptedRow {
  id: string;
  createdAt: string;
  doingWell: string | null;
  doingPoorly: string | null;
  wantToSee: string | null;
  userAgent: string | null;
  pagePath: string | null;
  decryptError: string | null;
}

const aadFor = (column: string) => utf8ToBytes(`user_feedback:${column}`);

function decryptOrNull(
  cipher: Cipher,
  ct: string | null,
  column: string,
): { value: string | null; error: string | null } {
  if (ct === null) return { value: null, error: null };
  try {
    return { value: cipher.decrypt(ct, aadFor(column)), error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : 'decrypt failed' };
  }
}

function decryptRow(cipher: Cipher, row: FeedbackListRow): DecryptedRow {
  const dw = decryptOrNull(cipher, row.doing_well_ciphertext, 'doing_well');
  const dp = decryptOrNull(cipher, row.doing_poorly_ciphertext, 'doing_poorly');
  const wts = decryptOrNull(cipher, row.want_to_see_ciphertext, 'want_to_see');
  const ua = decryptOrNull(cipher, row.user_agent_ciphertext, 'user_agent');
  const pp = decryptOrNull(cipher, row.page_path_ciphertext, 'page_path');
  const firstError = dw.error ?? dp.error ?? wts.error ?? ua.error ?? pp.error ?? null;
  return {
    id: row.id,
    createdAt: row.created_at,
    doingWell: dw.value,
    doingPoorly: dp.value,
    wantToSee: wts.value,
    userAgent: ua.value,
    pagePath: pp.value,
    decryptError: firstError,
  };
}

export default function FeedbackViewer() {
  const router = useRouter();
  const { data, isLoading, error: fetchError } = useFeedbackList();
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [cipherKey, setCipherKey] = useState<CipherKey | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  useEffect(() => {
    track('feedback_viewer_page_viewed');
  }, []);

  const cipher = useMemo(() => (cipherKey ? createCipher(cipherKey) : null), [cipherKey]);

  const decryptedRows = useMemo<DecryptedRow[] | null>(() => {
    if (!cipher || !data?.rows) return null;
    return data.rows.map((row) => decryptRow(cipher, row));
  }, [cipher, data]);

  const handleUnlock = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      try {
        const k = parseKey(keyInput);
        setCipherKey(k);
        setKeyError(null);
        track('feedback_viewer_key_accepted');
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'invalid key';
        setKeyError(msg);
        setCipherKey(null);
        track('feedback_viewer_key_rejected', { reason: msg });
      }
    },
    [keyInput],
  );

  const handleForget = useCallback(() => {
    setCipherKey(null);
    setKeyInput('');
    setKeyError(null);
    track('feedback_viewer_key_forgotten');
  }, []);

  const failedDecrypts = decryptedRows?.filter((r) => r.decryptError !== null).length ?? 0;
  const allDecryptsFailed =
    decryptedRows !== null && decryptedRows.length > 0 && failedDecrypts === decryptedRows.length;

  return (
    <div data-testid="feedback-viewer" className="flex flex-col gap-4">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold mb-2">User Feedback</h2>
            <p className="text-muted-foreground text-sm">
              All user-supplied columns are encrypted server-side. Paste the
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">FEEDBACK_SECRET</code>
              to decrypt in your browser. The key never leaves this page.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={() => {
              localStorage.removeItem(FEATURE_GATE_KEY);
              window.dispatchEvent(new Event('inferencex:feature-gate:locked'));
              track('feedback_viewer_relocked');
              router.push('/inference');
            }}
            title="Re-lock feature gate"
          >
            <Lock className="size-3" />
            Re-lock feature gate
          </Button>
        </div>
      </Card>

      <Card>
        <form onSubmit={handleUnlock} className="flex flex-col gap-2">
          <label htmlFor="feedback-key" className="text-xs font-medium">
            Decryption key (base64, 32 bytes)
          </label>
          <div className="flex flex-row gap-2">
            <div className="relative flex-1">
              <Input
                id="feedback-key"
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                data-testid="feedback-key-input"
                placeholder="base64-encoded key"
                className="pr-9 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? 'Hide key' : 'Show key'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button
              type="submit"
              disabled={keyInput.trim().length === 0}
              data-testid="feedback-key-submit"
            >
              <KeyRound className="size-4" />
              Decrypt
            </Button>
            {cipherKey && (
              <Button
                type="button"
                variant="outline"
                onClick={handleForget}
                data-testid="feedback-key-forget"
              >
                Forget key
              </Button>
            )}
          </div>
          {keyError && (
            <p role="alert" className="text-xs text-destructive">
              {keyError}
            </p>
          )}
          {allDecryptsFailed && (
            <p role="alert" className="text-xs text-destructive">
              All rows failed to decrypt — the key parses but doesn't match the data.
            </p>
          )}
        </form>
      </Card>

      {fetchError && (
        <Card>
          <p className="text-destructive text-sm">Failed to load feedback rows.</p>
        </Card>
      )}

      {isLoading && (
        <Card>
          <p className="text-muted-foreground text-sm">Loading rows…</p>
        </Card>
      )}

      {data && data.rows.length === 0 && (
        <Card>
          <p className="text-muted-foreground text-sm">No feedback rows yet.</p>
        </Card>
      )}

      {data && data.rows.length > 0 && decryptedRows === null && (
        <Card>
          <p className="text-muted-foreground text-sm">
            {data.rows.length} encrypted row{data.rows.length === 1 ? '' : 's'} loaded. Enter the
            key above to decrypt.
          </p>
        </Card>
      )}

      {decryptedRows && decryptedRows.length > 0 && (
        <div data-testid="feedback-rows" className="flex flex-col gap-2">
          {decryptedRows.map((row) => (
            <FeedbackRow key={row.id} row={row} />
          ))}
          <p className="text-xs text-muted-foreground">
            {decryptedRows.length} row{decryptedRows.length === 1 ? '' : 's'}
            {failedDecrypts > 0 ? ` · ${failedDecrypts} failed to decrypt` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

function FeedbackRow({ row }: { row: DecryptedRow }) {
  if (row.decryptError) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">#{row.id}</span>
          <span className="text-destructive">decrypt failed</span>
          <span className="text-muted-foreground tabular-nums">
            {new Date(row.createdAt).toISOString()}
          </span>
        </div>
      </Card>
    );
  }
  return (
    <Card data-testid={`feedback-row-${row.id}`}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <span>#{row.id}</span>
          <span className="tabular-nums">{new Date(row.createdAt).toISOString()}</span>
          <span className="font-mono">{row.pagePath ?? '?'}</span>
        </div>
        {row.doingWell && (
          <FieldRow label="What works well" value={row.doingWell} tone="positive" />
        )}
        {row.doingPoorly && (
          <FieldRow label="What could be better" value={row.doingPoorly} tone="negative" />
        )}
        {row.wantToSee && <FieldRow label="Would like to see" value={row.wantToSee} tone="want" />}
        {row.userAgent && (
          <p className="text-[10px] text-muted-foreground/70 font-mono">{row.userAgent}</p>
        )}
      </div>
    </Card>
  );
}

function FieldRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'want';
}) {
  const toneClass =
    tone === 'positive'
      ? 'border-l-2 border-emerald-500/40'
      : tone === 'negative'
        ? 'border-l-2 border-amber-500/40'
        : 'border-l-2 border-sky-500/40';
  return (
    <div className={`pl-3 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <p className="text-sm whitespace-pre-wrap break-words">{value}</p>
    </div>
  );
}
