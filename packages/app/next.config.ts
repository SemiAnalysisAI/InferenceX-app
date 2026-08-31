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
  // The whole-workspace typecheck already runs as its own gating CI job
  // (`bun run typecheck` in tests-unit.yml), and the E2E matrix builds the
  // app in eight parallel E2E shard jobs that each repeated the same ~30s TypeScript
  // pass inside `next build`. Skip the duplicate pass in GitHub Actions only;
  // Vercel and local builds still typecheck. Gated on GITHUB_ACTIONS (not CI,
  // which Vercel also sets) to match turbopackFileSystemCacheForBuild below.
  typescript: {
    ignoreBuildErrors: process.env.GITHUB_ACTIONS === 'true',
  },
  serverExternalPackages: ['shiki'],
  redirects() {
    return Promise.resolve([
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
    ]);
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'd3', '@tanstack/react-query'],
    // NOTE: route transitions (src/app/motion.css "Route transitions" block)
    // need no config here. Next 15–16.2 gated React's <ViewTransition> behind
    // `experimental.viewTransition`; the React build vendored by Next 16.3
    // exports it as stable `React.ViewTransition`, and 16.3 removed the flag
    // from the config schema (setting it now fails validation).
    // components/motion/route-transition.tsx feature-detects the export, so
    // navigation correctness never depends on it.
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
