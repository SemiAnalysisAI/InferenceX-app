import { withPostHogConfig } from '@posthog/nextjs-config';
import type { NextConfig } from 'next';
import { allowedDevOriginsFromEnv } from './src/lib/allowed-dev-origins';

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

export default withPostHogConfig(nextConfig, {
  personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY ?? '',
  projectId: process.env.POSTHOG_PROJECT_ID ?? '',
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  sourcemaps: {
    enabled: true,
    deleteAfterUpload: true,
  },
});
