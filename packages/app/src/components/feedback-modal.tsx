'use client';

import { CheckCircle2, MessageSquareText } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useId, useState } from 'react';

import { track } from '@/lib/analytics';
import type { Locale } from '@/lib/i18n';
import { useLocale } from '@/lib/use-locale';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const MAX_LEN = 2000;
const SUCCESS_HOLD_MS = 2000;

export const FEEDBACK_SUBMITTED_EVENT = 'inferencex:feedback-submitted';

type Status = 'idle' | 'submitting' | 'success' | 'error';

export interface FeedbackFormProps {
  /** Engine-supplied close + persist-dismissal hook. */
  onDismiss: () => void;
  /** Test/embedded-surface override. Production defaults to the current route locale. */
  locale?: Locale;
  /** Engine-owned IDs referenced by the containing dialog. */
  titleId?: string;
  descriptionId?: string;
}

const STRINGS = {
  en: {
    validation: 'Please fill in at least one field.',
    rateLimit: 'Too many submissions — please try again later.',
    rejected: 'Submission rejected. Please check the fields and try again.',
    saveFailed: 'Could not save your feedback. Please try again.',
    unknownError: 'Something went wrong.',
    successTitle: 'Thanks for your feedback!',
    successBody: 'We read every response.',
    title: 'Help us improve InferenceX',
    description: "We'd love to hear what's working and what isn't.",
    worksWell: 'What works well?',
    improve: 'What could be better?',
    want: 'What would you like to see?',
    privacy: 'Your response is encrypted and only visible to the InferenceX team.',
    dismiss: 'Maybe later',
    sending: 'Sending…',
    submit: 'Send feedback',
  },
  zh: {
    validation: '请至少填写一项。',
    rateLimit: '提交次数过多，请稍后再试。',
    rejected: '提交未通过校验，请检查填写内容后重试。',
    saveFailed: '反馈保存失败，请重试。',
    unknownError: '出现意外错误，请重试。',
    successTitle: '感谢您的反馈！',
    successBody: '我们会认真阅读每一条反馈。',
    title: '帮助我们改进 InferenceX',
    description: '欢迎告诉我们哪些体验不错，以及哪些地方需要改进。',
    worksWell: '哪些地方做得好？',
    improve: '哪些地方可以改进？',
    want: '还希望看到哪些功能？',
    privacy: '您的反馈会加密保存，只有 InferenceX 团队可以查看。',
    dismiss: '稍后再说',
    sending: '正在发送……',
    submit: '发送反馈',
  },
} as const;

export function FeedbackForm({
  onDismiss,
  locale: localeOverride,
  titleId: titleIdOverride,
  descriptionId: descriptionIdOverride,
}: FeedbackFormProps) {
  const [doingWell, setDoingWell] = useState('');
  const [doingPoorly, setDoingPoorly] = useState('');
  const [wantToSee, setWantToSee] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pathname = usePathname();
  const routeLocale = useLocale();
  const locale = localeOverride ?? routeLocale;
  const t = STRINGS[locale];
  const generatedTitleId = useId();
  const generatedDescriptionId = useId();
  const titleId = titleIdOverride ?? generatedTitleId;
  const descriptionId = descriptionIdOverride ?? generatedDescriptionId;

  const handleSubmit = useCallback(async () => {
    if (status === 'submitting') return;
    const filledFields = [
      doingWell.trim() && 'doing_well',
      doingPoorly.trim() && 'doing_poorly',
      wantToSee.trim() && 'want_to_see',
    ].filter(Boolean) as string[];
    track('feedback_modal_submit_clicked', { filled_fields: filledFields.join(',') });

    if (filledFields.length === 0) {
      setErrorMsg(t.validation);
      setStatus('error');
      return;
    }

    setStatus('submitting');
    setErrorMsg(null);

    try {
      const res = await fetch('/api/v1/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doingWell: doingWell.trim() || undefined,
          doingPoorly: doingPoorly.trim() || undefined,
          wantToSee: wantToSee.trim() || undefined,
          honeypot,
          pagePath: pathname ?? undefined,
        }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error(t.rateLimit);
        }
        if (res.status === 400) {
          throw new Error(t.rejected);
        }
        throw new Error(t.saveFailed);
      }

      window.dispatchEvent(new Event(FEEDBACK_SUBMITTED_EVENT));
      track('feedback_modal_submitted', { filled_fields: filledFields.join(',') });
      setStatus('success');
      window.setTimeout(onDismiss, SUCCESS_HOLD_MS);
    } catch (error) {
      const knownMessage =
        error instanceof Error &&
        (error.message === t.rateLimit ||
          error.message === t.rejected ||
          error.message === t.saveFailed)
          ? error.message
          : t.unknownError;
      setErrorMsg(knownMessage);
      setStatus('error');
    }
  }, [doingWell, doingPoorly, wantToSee, honeypot, pathname, status, onDismiss, t]);

  const handleDismiss = useCallback(() => {
    track('feedback_modal_later_clicked');
    onDismiss();
  }, [onDismiss]);

  const submitting = status === 'submitting';

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <CheckCircle2 className="size-8 text-brand" />
        <h2 id={titleId} className="text-lg font-semibold">
          {t.successTitle}
        </h2>
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {t.successBody}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1.5 pr-6">
        <h2 id={titleId} className="flex items-center gap-2 text-lg font-semibold">
          <MessageSquareText className="size-5 text-brand" />
          {t.title}
        </h2>
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {t.description}
        </p>
      </div>

      <FieldBlock
        label={t.worksWell}
        value={doingWell}
        onChange={setDoingWell}
        disabled={submitting}
        testId="feedback-doing-well"
      />
      <FieldBlock
        label={t.improve}
        value={doingPoorly}
        onChange={setDoingPoorly}
        disabled={submitting}
        testId="feedback-doing-poorly"
      />
      <FieldBlock
        label={t.want}
        value={wantToSee}
        onChange={setWantToSee}
        disabled={submitting}
        testId="feedback-want-to-see"
      />

      {/* Honeypot — hidden from real users, visible to naive bots. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: -9999, top: -9999 }}>
        <label>
          Website
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>

      <p className="text-xs text-muted-foreground">{t.privacy}</p>

      {errorMsg && (
        <p className="text-xs text-destructive" role="alert">
          {errorMsg}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={handleDismiss}
          disabled={submitting}
          data-testid="feedback-modal-dismiss"
        >
          {t.dismiss}
        </Button>
        <Button onClick={handleSubmit} disabled={submitting} data-testid="feedback-modal-submit">
          {submitting ? t.sending : t.submit}
        </Button>
      </div>
    </div>
  );
}

function FieldBlock({
  label,
  value,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  testId: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-xs font-medium">
          {label}
        </label>
        <span className="text-3xs tabular-nums text-muted-foreground">
          {value.length}/{MAX_LEN}
        </span>
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_LEN))}
        disabled={disabled}
        rows={2}
        data-testid={testId}
        className="min-h-12 text-sm"
      />
    </div>
  );
}
