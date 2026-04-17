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
