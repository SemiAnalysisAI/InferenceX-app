interface VideoAliasRedirect {
  source: string;
  destination: string;
  permanent: true;
}

/**
 * Vanity aliases for the VideoGenX dashboard. `/video` stays the canonical
 * home in both locale trees; the aliases 308-redirect there like the other
 * alias tables in `next.config.ts`, so shared links keep working and search
 * engines see one indexable URL. Query strings are carried automatically by
 * Next's redirect handling.
 */
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
