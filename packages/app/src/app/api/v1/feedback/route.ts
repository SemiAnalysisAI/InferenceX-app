import { NextResponse } from 'next/server';

import { utf8ToBytes } from '@noble/ciphers/utils.js';

import { getWriteDb } from '@semianalysisai/inferencex-db/connection';
import { type Cipher, createCipher, loadKey } from '@semianalysisai/inferencex-db/lib/encryption';

import { parseFeedbackBody } from './parse';

const aadFor = (column: string) => utf8ToBytes(`user_feedback:${column}`);

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 5 * 1024;

// Opaque 5xx code for operator triage without log grep.
type ServerErrorCode = 'E_CRYPTO' | 'E_INSERT';

function serverError(code: ServerErrorCode) {
  return NextResponse.json({ error: 'storage error', code }, { status: 500 });
}

export async function POST(request: Request) {
  // Pre-check header so oversized bodies don't get buffered.
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload too large' }, { status: 400 });
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload too large' }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const result = parseFeedbackBody(parsed);
  if (!result.ok) {
    if (result.error === 'all_empty') {
      return NextResponse.json({ error: 'all fields empty' }, { status: 400 });
    }
    if (result.error === 'field_too_long') {
      return NextResponse.json({ error: 'field too long' }, { status: 400 });
    }
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const body = result.value;

  // Honeypot — bots fill hidden fields. Silent 204 discourages iteration.
  if (body.honeypotTripped) {
    return new NextResponse(null, { status: 204 });
  }

  let cipher: Cipher;
  let sql: ReturnType<typeof getWriteDb>;
  try {
    cipher = createCipher(loadKey('FEEDBACK_SECRET'));
    sql = getWriteDb();
  } catch (error) {
    console.error('feedback: misconfigured', error);
    return serverError('E_CRYPTO');
  }

  const encryptOrNull = (value: string | null, column: string) =>
    value === null ? null : cipher.encrypt(value, aadFor(column));

  const doingWellCt = encryptOrNull(body.doingWell, 'doing_well');
  const doingPoorlyCt = encryptOrNull(body.doingPoorly, 'doing_poorly');
  const wantToSeeCt = encryptOrNull(body.wantToSee, 'want_to_see');

  const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 500) || null;
  const userAgentCt = encryptOrNull(userAgent, 'user_agent');
  const pagePathCt = encryptOrNull(body.pagePath, 'page_path');

  try {
    await sql`
      insert into user_feedback (
        doing_well_ciphertext,
        doing_poorly_ciphertext,
        want_to_see_ciphertext,
        user_agent_ciphertext,
        page_path_ciphertext
      ) values (
        ${doingWellCt},
        ${doingPoorlyCt},
        ${wantToSeeCt},
        ${userAgentCt},
        ${pagePathCt}
      )
    `;
  } catch (error) {
    console.error('feedback: insert failed', error);
    return serverError('E_INSERT');
  }

  return new NextResponse(null, { status: 204 });
}
