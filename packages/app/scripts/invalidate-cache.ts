export {};

/**
 * Invalidate the Next.js data cache by hitting the /api/v1/invalidate endpoint.
 *
 * Usage:
 *   pnpm admin:cache:invalidate [url]           (default: http://localhost:3000)
 *   pnpm admin:cache:invalidate https://inferencex.semianalysis.com
 */

if (!process.env.INVALIDATE_SECRET) {
  console.error('INVALIDATE_SECRET is required');
  process.exit(1);
}

const rawUrl = process.argv.filter((a) => a !== '--').slice(2)[0] ?? 'http://localhost:3000';

// Strip hash, query params, and trailing path — keep just origin
const parsed = new URL(rawUrl);
const endpoint = `${parsed.origin}/api/v1/invalidate`;

console.log(`Invalidating: ${endpoint}`);

async function invalidateCache() {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.INVALIDATE_SECRET!}` },
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

invalidateCache().catch((err) => {
  console.error('invalidate-cache failed:', err);
  process.exitCode = 1;
});
