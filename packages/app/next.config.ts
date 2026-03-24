import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
