// GET /api/v1/feedback/list — public; rows are ciphertext-only, decrypted client-side.

import { NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getFeedbackList } from '@semianalysisai/inferencex-db/queries/submissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await getFeedbackList(getDb());
    return NextResponse.json({ rows });
  } catch (error) {
    console.error('feedback list: query failed', error);
    return NextResponse.json({ error: 'storage error' }, { status: 500 });
  }
}
