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

export default nextConfig;
