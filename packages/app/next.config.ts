import type { NextConfig } from 'next';

/** Comma-separated hostnames or IPs (e.g. `10.112.9.49,192.168.1.10`). Only used in dev. */
function allowedDevOriginsFromEnv(): string[] {
  const raw = process.env.NEXT_DEV_ALLOWED_ORIGINS;
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const nextConfig: NextConfig = {
  allowedDevOrigins: allowedDevOriginsFromEnv(),
  transpilePackages: ['@semianalysisai/inferencex-constants'],
  serverExternalPackages: ['shiki'],
  images: {
    remotePatterns: [
      { hostname: 'placehold.co' },
      { hostname: 'substack-post-media.s3.amazonaws.com' },
    ],
  },
};

export default nextConfig;
