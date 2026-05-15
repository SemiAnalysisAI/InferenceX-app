/**
 * Single-pass schema parse for the feedback POST body.
 */

const MAX_FIELD_LEN = 2000;
const MAX_PAGE_PATH_LEN = 512;

export interface ParsedFeedback {
  doingWell: string | null;
  doingPoorly: string | null;
  wantToSee: string | null;
  honeypotTripped: boolean;
  pagePath: string | null;
}

export type ParseResult =
  | { ok: true; value: ParsedFeedback }
  | { ok: false; error: 'invalid_shape' | 'field_too_long' | 'all_empty' };

function trimOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function exceedsCap(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.length > max;
}

function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.codePointAt(i);
    // C0 controls (< 0x20) plus DEL (0x7F) — decimals sidestep the
    // formatter/linter disagreement over hex casing on this codebase.
    if (c !== undefined && (c < 32 || c === 127)) return true;
  }
  return false;
}

function pickPagePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > MAX_PAGE_PATH_LEN) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null; // protocol-relative URLs
  if (hasControlChar(value)) return null; // CRLF, etc.
  return value;
}

export function parseFeedbackBody(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'invalid_shape' };
  }
  const body = raw as Record<string, unknown>;

  if (
    exceedsCap(body.doingWell, MAX_FIELD_LEN) ||
    exceedsCap(body.doingPoorly, MAX_FIELD_LEN) ||
    exceedsCap(body.wantToSee, MAX_FIELD_LEN)
  ) {
    return { ok: false, error: 'field_too_long' };
  }

  const doingWell = trimOrNull(body.doingWell);
  const doingPoorly = trimOrNull(body.doingPoorly);
  const wantToSee = trimOrNull(body.wantToSee);

  if (!doingWell && !doingPoorly && !wantToSee) {
    return { ok: false, error: 'all_empty' };
  }

  return {
    ok: true,
    value: {
      doingWell,
      doingPoorly,
      wantToSee,
      honeypotTripped: trimOrNull(body.honeypot) !== null,
      pagePath: pickPagePath(body.pagePath),
    },
  };
}

export const FIELD_LIMITS = { MAX_FIELD_LEN, MAX_PAGE_PATH_LEN };
