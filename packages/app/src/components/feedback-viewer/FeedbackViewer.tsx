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
import { useLocale } from '@/lib/use-locale';
import { relockFeatureGate } from '@/lib/use-feature-gate';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

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

const STRINGS = {
  en: {
    heading: 'User Feedback',
    explanation: 'All user-supplied columns are encrypted server-side. Paste the',
    explanationSuffix: 'to decrypt in your browser. The key never leaves this page.',
    relock: 'Re-lock feature gate',
    keyLabel: 'Decryption key (base64, 32 bytes)',
    keyPlaceholder: 'base64-encoded key',
    decrypt: 'Decrypt',
    forgetKey: 'Forget key',
    hideKey: 'Hide key',
    showKey: 'Show key',
    allDecryptsFailed: "All rows failed to decrypt — the key parses but doesn't match the data.",
    fetchError: 'Failed to load feedback rows.',
    loadingRows: 'Loading rows…',
    noRows: 'No feedback rows yet.',
    enterKey: 'Enter the key above to decrypt.',
    encryptedRowsLoaded: (n: number) => `${n} encrypted row${n === 1 ? '' : 's'} loaded.`,
    rowCount: (n: number) => `${n} row${n === 1 ? '' : 's'}`,
    failedToDecrypt: (n: number) => ` · ${n} failed to decrypt`,
    decryptFailed: 'decrypt failed',
    whatWorksWell: 'What works well',
    whatCouldBeBetter: 'What could be better',
    wouldLikeToSee: 'Would like to see',
  },
  zh: {
    heading: '用户反馈',
    explanation: '所有用户提交的字段均在服务端加密。粘贴',
    explanationSuffix: '即可在浏览器中解密。密钥不会离开此页面。',
    relock: '重新锁定功能入口',
    keyLabel: '解密密钥（base64，32 字节）',
    keyPlaceholder: 'base64 编码密钥',
    decrypt: '解密',
    forgetKey: '忘记密钥',
    hideKey: '隐藏密钥',
    showKey: '显示密钥',
    allDecryptsFailed: '所有行均解密失败——密钥格式正确但与数据不匹配。',
    fetchError: '无法加载反馈数据。',
    loadingRows: '加载中……',
    noRows: '暂无反馈记录。',
    enterKey: '请在上方输入密钥进行解密。',
    encryptedRowsLoaded: (n: number) => `已加载 ${n} 条加密记录。`,
    rowCount: (n: number) => `共 ${n} 条记录`,
    failedToDecrypt: (n: number) => `，其中 ${n} 条解密失败`,
    decryptFailed: '解密失败',
    whatWorksWell: '做得好的地方',
    whatCouldBeBetter: '可以改进的地方',
    wouldLikeToSee: '希望看到的功能',
  },
} as const;

export default function FeedbackViewer() {
  const router = useRouter();
  const { data, isLoading, error: fetchError } = useFeedbackList();
  const locale = useLocale();
  const t = STRINGS[locale];
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
            <h2 className="text-lg font-semibold mb-2">{t.heading}</h2>
            <p className="text-muted-foreground text-sm">
              {t.explanation}
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">FEEDBACK_SECRET</code>
              {t.explanationSuffix}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={() => {
              relockFeatureGate();
              track('feedback_viewer_relocked');
              router.push(locale === 'zh' ? '/zh/inference' : '/inference');
            }}
            title={t.relock}
          >
            <Lock className="size-3" />
            {t.relock}
          </Button>
        </div>
      </Card>

      <Card>
        <form onSubmit={handleUnlock} className="flex flex-col gap-2">
          <label htmlFor="feedback-key" className="text-xs font-medium">
            {t.keyLabel}
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
                placeholder={t.keyPlaceholder}
                className="pr-9 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? t.hideKey : t.showKey}
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
              {t.decrypt}
            </Button>
            {cipherKey && (
              <Button
                type="button"
                variant="outline"
                onClick={handleForget}
                data-testid="feedback-key-forget"
              >
                {t.forgetKey}
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
              {t.allDecryptsFailed}
            </p>
          )}
        </form>
      </Card>

      {fetchError && (
        <Card>
          <p className="text-destructive text-sm">{t.fetchError}</p>
        </Card>
      )}

      {isLoading && (
        <Card>
          <p className="text-muted-foreground text-sm">{t.loadingRows}</p>
        </Card>
      )}

      {data && data.rows.length === 0 && (
        <Card>
          <p className="text-muted-foreground text-sm">{t.noRows}</p>
        </Card>
      )}

      {data && data.rows.length > 0 && decryptedRows === null && (
        <Card>
          <p className="text-muted-foreground text-sm">
            {t.encryptedRowsLoaded(data.rows.length)} {t.enterKey}
          </p>
        </Card>
      )}

      {decryptedRows && decryptedRows.length > 0 && (
        <div data-testid="feedback-rows" className="flex flex-col gap-2">
          {decryptedRows.map((row) => (
            <FeedbackRow key={row.id} row={row} />
          ))}
          <p className="text-xs text-muted-foreground">
            {t.rowCount(decryptedRows.length)}
            {failedDecrypts > 0 ? t.failedToDecrypt(failedDecrypts) : ''}
          </p>
        </div>
      )}
    </div>
  );
}

function FeedbackRow({ row }: { row: DecryptedRow }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  if (row.decryptError) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">#{row.id}</span>
          <span className="text-destructive">{t.decryptFailed}</span>
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
          <FieldRow label={t.whatWorksWell} value={row.doingWell} tone="positive" />
        )}
        {row.doingPoorly && (
          <FieldRow label={t.whatCouldBeBetter} value={row.doingPoorly} tone="negative" />
        )}
        {row.wantToSee && <FieldRow label={t.wouldLikeToSee} value={row.wantToSee} tone="want" />}
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
