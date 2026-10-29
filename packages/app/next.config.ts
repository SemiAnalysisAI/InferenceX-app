import { withPostHogConfig } from '@posthog/nextjs-config';
import type { NextConfig } from 'next';
import { allowedDevOriginsFromEnv } from './src/lib/runtime/allowed-dev-origins';
import { INFERENCE_MODEL_ALIAS_REDIRECTS } from './src/lib/routing/inference-model-redirects';
import { VIDEO_ALIAS_REDIRECTS } from './src/lib/video/video-alias-redirects';

const LOCALE_PREFIXES = ['', '/zh'] as const;

const SEO_REDIRECTS = [
  { source: '/datasets', destination: '/agentx' },
  { source: '/zh/datasets', destination: '/zh/agentx' },
  ...LOCALE_PREFIXES.flatMap((prefix) => [
    { source: `${prefix}/xvideo`, destination: `${prefix}/video` },
    { source: `${prefix}/xxvideo`, destination: `${prefix}/video` },
    { source: `${prefix}/run/glm-5-2-on-:chip`, destination: `${prefix}/run/glm-5-3-on-:chip` },
    {
      source: `${prefix}/rankings/fastest-gpu-for-glm-5-2`,
      destination: `${prefix}/rankings/fastest-gpu-for-glm-5-3`,
    },
    {
      source: `${prefix}/rankings/cheapest-gpu-for-glm-5-2`,
      destination: `${prefix}/rankings/cheapest-gpu-for-glm-5-3`,
    },
    {
      source: `${prefix}/rankings/fastest-gpu-for-qwen-3-5-0`,
      destination: `${prefix}/rankings/fastest-gpu-for-qwen-3-5`,
    },
    {
      source: `${prefix}/rankings/fastest-gpu-for-minimax-m3-1`,
      destination: `${prefix}/rankings/fastest-gpu-for-minimax-m31-flash`,
    },
    {
      source: `${prefix}/rankings/fastest-gpu-for-minimax-m27-0`,
      destination: `${prefix}/rankings/fastest-gpu-for-minimax-m27`,
    },
    {
      source: `${prefix}/blog/minimax-m3-agentx-b200-b300-vs-rack-scale-0`,
      destination: `${prefix}/blog/minimax-m3-agentx-b200-b300-vs-rack-scale`,
    },
    { source: `${prefix}/media`, destination: `${prefix}/quotes` },
  ]),
].map((redirect) => ({ ...redirect, permanent: true }));

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  allowedDevOrigins: allowedDevOriginsFromEnv(),
  transpilePackages: ['@semianalysisai/inferencex-constants'],
  serverExternalPackages: ['shiki'],
  redirects() {
    return Promise.resolve([
      ...SEO_REDIRECTS,
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
  headers() {
    return Promise.resolve([
      {
        source: '/:path((?!zh(?:/|$)).*)',
        headers: [{ key: 'Content-Language', value: 'en' }],
      },
      { source: '/zh', headers: [{ key: 'Content-Language', value: 'zh-CN' }] },
      { source: '/zh/:path*', headers: [{ key: 'Content-Language', value: 'zh-CN' }] },
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
