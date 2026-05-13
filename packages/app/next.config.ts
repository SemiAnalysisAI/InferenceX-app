import { withPostHogConfig } from '@posthog/nextjs-config';
import type { NextConfig } from 'next';
import { allowedDevOriginsFromEnv } from './src/lib/allowed-dev-origins';

const nextConfig: NextConfig = {
  allowedDevOrigins: allowedDevOriginsFromEnv(),
  transpilePackages: ['@semianalysisai/inferencex-constants'],
  serverExternalPackages: ['shiki'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'd3', '@tanstack/react-query'],
  },
  images: {
    remotePatterns: [
      { hostname: 'placehold.co' },
      { hostname: 'substack-post-media.s3.amazonaws.com' },
    ],
  },
  // /embed/* routes are explicitly framable from any origin so partner sites
  // can iframe them. All other routes are non-framable (frame-ancestors
  // 'self' + X-Frame-Options: SAMEORIGIN). Order matters: the more specific
  // /embed/* match comes first.
  headers() {
    return Promise.resolve([
      {
        source: '/embed/:path*',
        headers: [{ key: 'Content-Security-Policy', value: 'frame-ancestors *' }],
      },
      {
        // Negative lookahead excludes /embed/* so its CSP isn't overridden
        // by the more general non-framable headers.
        source: '/((?!embed/).*)',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ]);
  },
};

const hasPostHogKeys = Boolean(
  process.env.NODE_ENV === 'production' &&
  process.env.POSTHOG_PERSONAL_API_KEY &&
  process.env.POSTHOG_PROJECT_ID,
);

export default hasPostHogKeys
  ? withPostHogConfig(nextConfig, {
      personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY!,
      projectId: process.env.POSTHOG_PROJECT_ID!,
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      sourcemaps: {
        enabled: true,
        deleteAfterUpload: true,
      },
    })
  : nextConfig;
