import { describe, expect, it } from 'vitest';

import { type ParsedFeedback, type ParseResult, parseFeedbackBody } from './parse';

function expectOk(r: ParseResult): ParsedFeedback {
  if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`);
  return r.value;
}

describe('parseFeedbackBody', () => {
  it('rejects non-objects', () => {
    expect(parseFeedbackBody(null)).toEqual({ ok: false, error: 'invalid_shape' });
    expect(parseFeedbackBody('hi')).toEqual({ ok: false, error: 'invalid_shape' });
  });

  it('rejects when all three fields are empty/missing', () => {
    expect(parseFeedbackBody({})).toEqual({ ok: false, error: 'all_empty' });
    expect(parseFeedbackBody({ doingWell: '   ' })).toEqual({ ok: false, error: 'all_empty' });
  });

  it('rejects when any field exceeds the cap (before trim)', () => {
    const long = 'x'.repeat(2001);
    expect(parseFeedbackBody({ doingWell: long })).toEqual({ ok: false, error: 'field_too_long' });
    expect(parseFeedbackBody({ wantToSee: long })).toEqual({ ok: false, error: 'field_too_long' });
  });

  it('trims and accepts a single field', () => {
    const v = expectOk(parseFeedbackBody({ doingWell: '  feedback  ' }));
    expect(v.doingWell).toBe('feedback');
    expect(v.doingPoorly).toBeNull();
    expect(v.honeypotTripped).toBe(false);
  });

  it('flags honeypotTripped when honeypot is non-empty', () => {
    expect(
      expectOk(parseFeedbackBody({ doingWell: 'x', honeypot: 'spam.example' })).honeypotTripped,
    ).toBe(true);
  });

  it('passes pagePath through when valid', () => {
    expect(expectOk(parseFeedbackBody({ doingWell: 'x', pagePath: '/inference' })).pagePath).toBe(
      '/inference',
    );
  });

  it('rejects pagePath that does not start with /', () => {
    expect(
      expectOk(parseFeedbackBody({ doingWell: 'x', pagePath: 'inference' })).pagePath,
    ).toBeNull();
  });

  it('rejects protocol-relative pagePath (//evil.example)', () => {
    expect(
      expectOk(parseFeedbackBody({ doingWell: 'x', pagePath: '//evil.example/x' })).pagePath,
    ).toBeNull();
  });

  it('rejects pagePath with control chars (CRLF)', () => {
    expect(
      expectOk(parseFeedbackBody({ doingWell: 'x', pagePath: '/inference\r\nX-Inject: 1' }))
        .pagePath,
    ).toBeNull();
  });

  it('rejects pagePath longer than the cap', () => {
    expect(
      expectOk(parseFeedbackBody({ doingWell: 'x', pagePath: `/${'a'.repeat(513)}` })).pagePath,
    ).toBeNull();
  });
});
