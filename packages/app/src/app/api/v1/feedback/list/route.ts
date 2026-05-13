// GET /api/v1/feedback/list — public; rows are ciphertext-only, decrypted client-side.

import { NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface FeedbackRow {
  id: string;
  created_at: string;
  doing_well_ciphertext: string | null;
  doing_poorly_ciphertext: string | null;
  want_to_see_ciphertext: string | null;
  user_agent_ciphertext: string | null;
  page_path_ciphertext: string | null;
}

export async function GET() {
  try {
    const rows = (await getDb()`
      select
        id::text as id,
        created_at,
        doing_well_ciphertext,
        doing_poorly_ciphertext,
        want_to_see_ciphertext,
        user_agent_ciphertext,
        page_path_ciphertext
      from user_feedback
      order by created_at desc
    `) as unknown as FeedbackRow[];
    return NextResponse.json({ rows });
  } catch (error) {
    console.error('feedback list: query failed', error);
    return NextResponse.json({ error: 'storage error' }, { status: 500 });
  }
}
