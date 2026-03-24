import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@semianalysisai/inferencex-constants'],
  serverExternalPackages: ['shiki'],
  images: {
    remotePatterns: [{ hostname: 'placehold.co' }],
  },
};

export default nextConfig;
