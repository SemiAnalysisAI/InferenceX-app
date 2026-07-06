import { withPostHogConfig } from '@posthog/nextjs-config';
import type { NextConfig } from 'next';
import { allowedDevOriginsFromEnv } from './src/lib/allowed-dev-origins';

const nextConfig: NextConfig = {
  // Allow a second, isolated dev server (e.g. a dump-mode instance on another
  // port) to run from the same project dir by pointing it at a separate build
  // dir via NEXT_DIST_DIR. Defaults to '.next' so the primary server and all
  // CI/prod builds are unaffected. Next.js's single-dev-server lock lives under
  // distDir, so distinct dirs let the two coexist.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  allowedDevOrigins: allowedDevOriginsFromEnv(),
  transpilePackages: ['@semianalysisai/inferencex-constants'],
  serverExternalPackages: ['shiki'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'd3', '@tanstack/react-query'],
    // NOTE: experimental.inlineCss was evaluated (2026-07) for the PageSpeed
    // "Render-blocking requests" insight and rejected: it embeds the full CSS
    // text in every route's RSC payload (~46 KiB gz, duplicated 2×), so every
    // client-side tab navigation re-downloads CSS that is otherwise a
    // one-time immutable fetch. Net regression for this SPA-heavy dashboard.
    // Persist Turbopack's compiler cache under .next/cache in GitHub Actions
    // so the workflow cache step makes warm builds fast. Gated on
    // GITHUB_ACTIONS (not CI, which Vercel also sets) to keep the
    // experimental flag out of production builds.
    ...(process.env.GITHUB_ACTIONS === 'true' && { turbopackFileSystemCacheForBuild: true }),
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
