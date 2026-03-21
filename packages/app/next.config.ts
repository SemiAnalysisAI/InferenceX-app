import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@semianalysisai/inferencex-constants'],
  serverExternalPackages: ['shiki'],
};

export default nextConfig;
