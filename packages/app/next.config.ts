import { withPostHogConfig } from '@posthog/nextjs-config';
import type { NextConfig } from 'next';
import { allowedDevOriginsFromEnv } from './src/lib/runtime/allowed-dev-origins';
import { INFERENCE_MODEL_ALIAS_REDIRECTS } from './src/lib/routing/inference-model-redirects';
import { VIDEO_ALIAS_REDIRECTS } from './src/lib/video/video-alias-redirects';

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  allowedDevOrigins: allowedDevOriginsFromEnv(),
  transpilePackages: ['@semianalysisai/inferencex-constants'],
  serverExternalPackages: ['shiki'],
  redirects() {
    return Promise.resolve([
      ...INFERENCE_MODEL_ALIAS_REDIRECTS,
      ...VIDEO_ALIAS_REDIRECTS,
      {
        source: '/datasets/:path*',
        destination: '/agentx/:path*',
        permanent: true,
      },
      {
        source: '/zh/datasets/:path*',
        destination: '/zh/agentx/:path*',
        permanent: true,
      },
      { source: '/gpu-metrics', destination: '/inference', permanent: true },
      { source: '/zh/gpu-metrics', destination: '/zh/inference', permanent: true },
    ]);
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'd3', '@tanstack/react-query'],
    ...(process.env.GITHUB_ACTIONS === 'true' && { turbopackFileSystemCacheForBuild: true }),
  },
  images: {
    qualities: [75, 100],
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
