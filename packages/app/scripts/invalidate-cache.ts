if (!process.env.INVALIDATE_SECRET) {
  console.error('INVALIDATE_SECRET is required');
  process.exit(1);
}

const rawUrl = process.argv.filter((a) => a !== '--').slice(2)[0] ?? 'http://localhost:3000';

const parsed = new URL(rawUrl);
const endpoint = `${parsed.origin}/api/v1/invalidate`;

console.log(`Invalidating: ${endpoint}`);

async function invalidateCache() {
  const bypassSecret = process.env.CACHE_PROTECTION_BYPASS_SECRET;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.INVALIDATE_SECRET!}`,
      ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}),
    },
  });

  if (!res.ok) {
    console.error(`Failed: ${res.status} ${res.statusText}`);
    const body = await res.text();
    if (body) console.error(body);
    process.exit(1);
  }

  const data = await res.json();
  console.log('Success:', JSON.stringify(data));
}

invalidateCache().catch((error) => {
  console.error('invalidate-cache failed:', error);
  process.exitCode = 1;
});
