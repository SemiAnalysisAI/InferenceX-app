interface VideoAliasRedirect {
  source: string;
  destination: string;
  permanent: true;
}

export const VIDEO_ROUTE_ALIASES = ['xvideo', 'xxvideo'] as const;

const LOCALE_PREFIXES = ['', '/zh'] as const;

export const VIDEO_ALIAS_REDIRECTS: readonly VideoAliasRedirect[] = LOCALE_PREFIXES.flatMap(
  (prefix) =>
    VIDEO_ROUTE_ALIASES.map((alias) => ({
      source: `${prefix}/${alias}/:path*`,
      destination: `${prefix}/video/:path*`,
      permanent: true as const,
    })),
);
