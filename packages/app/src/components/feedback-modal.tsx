'use client';

import { CheckCircle2, MessageSquareText } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useId, useState } from 'react';

import { track } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const MAX_LEN = 2000;
const SUCCESS_HOLD_MS = 2000;

export const FEEDBACK_SUBMITTED_EVENT = 'inferencex:feedback-submitted';

type Status = 'idle' | 'submitting' | 'success' | 'error';

export interface FeedbackFormProps {
  /** Engine-supplied close + persist-dismissal hook. */
  onDismiss: () => void;
}

export function FeedbackForm({ onDismiss }: FeedbackFormProps) {
  const [doingWell, setDoingWell] = useState('');
  const [doingPoorly, setDoingPoorly] = useState('');
  const [wantToSee, setWantToSee] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pathname = usePathname();
  const titleId = useId();
  const descId = useId();

  const handleSubmit = useCallback(async () => {
    if (status === 'submitting') return;
    const filledFields = [
      doingWell.trim() && 'doing_well',
      doingPoorly.trim() && 'doing_poorly',
      wantToSee.trim() && 'want_to_see',
    ].filter(Boolean) as string[];

    if (filledFields.length === 0) {
      setErrorMsg('Please fill in at least one field.');
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
          throw new Error('Too many submissions — please try again later.');
        }
        if (res.status === 400) {
          throw new Error('Submission rejected. Please check the fields and try again.');
        }
        throw new Error('Could not save your feedback. Please try again.');
      }

      window.dispatchEvent(new Event(FEEDBACK_SUBMITTED_EVENT));
      track('feedback_modal_submitted', { filled_fields: filledFields.join(',') });
      setStatus('success');
      window.setTimeout(onDismiss, SUCCESS_HOLD_MS);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Something went wrong.');
      setStatus('error');
    }
  }, [doingWell, doingPoorly, wantToSee, honeypot, pathname, status, onDismiss]);

  const submitting = status === 'submitting';

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <CheckCircle2 className="size-8 text-brand" />
        <h2 id={titleId} className="text-lg font-semibold">
          Thanks for your feedback!
        </h2>
        <p id={descId} className="text-sm text-muted-foreground">
          We read every response.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1.5 pr-6">
        <h2 id={titleId} className="flex items-center gap-2 text-lg font-semibold">
          <MessageSquareText className="size-5 text-brand" />
          Help us improve InferenceX
        </h2>
        <p id={descId} className="text-sm text-muted-foreground">
          You're a regular! We'd love to hear what's working and what isn't.
        </p>
      </div>

      <FieldBlock
        label="What works well?"
        value={doingWell}
        onChange={setDoingWell}
        disabled={submitting}
        testId="feedback-doing-well"
      />
      <FieldBlock
        label="What could be better?"
        value={doingPoorly}
        onChange={setDoingPoorly}
        disabled={submitting}
        testId="feedback-doing-poorly"
      />
      <FieldBlock
        label="What would you like to see?"
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

      <p className="text-xs text-muted-foreground">
        Your response is encrypted and only visible to the InferenceX team.
      </p>

      {errorMsg && (
        <p className="text-xs text-destructive" role="alert">
          {errorMsg}
        </p>
      )}

      <div className="flex flex-row justify-end gap-2">
        <Button
          variant="outline"
          onClick={onDismiss}
          disabled={submitting}
          data-testid="feedback-modal-dismiss"
        >
          Maybe later
        </Button>
        <Button onClick={handleSubmit} disabled={submitting} data-testid="feedback-modal-submit">
          {submitting ? 'Sending…' : 'Send feedback'}
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
        <span className="text-[10px] tabular-nums text-muted-foreground">
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
