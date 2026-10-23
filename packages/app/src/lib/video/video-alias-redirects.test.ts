import { describe, expect, it } from 'vitest';

import { VIDEO_ALIAS_REDIRECTS, VIDEO_ROUTE_ALIASES } from './video-alias-redirects';

describe('VIDEO_ALIAS_REDIRECTS', () => {
  it('redirects every alias to /video in both locale trees', () => {
    expect(VIDEO_ALIAS_REDIRECTS).toHaveLength(VIDEO_ROUTE_ALIASES.length * 2);

    for (const alias of VIDEO_ROUTE_ALIASES) {
      for (const prefix of ['', '/zh']) {
        expect(VIDEO_ALIAS_REDIRECTS).toContainEqual({
          source: `${prefix}/${alias}/:path*`,
          destination: `${prefix}/video/:path*`,
          permanent: true,
        });
      }
    }
  });

  it('covers the /xvideo and /xxvideo vanity paths', () => {
    const sources = VIDEO_ALIAS_REDIRECTS.map((redirect) => redirect.source);
    expect(sources).toContain('/xvideo/:path*');
    expect(sources).toContain('/xxvideo/:path*');
    expect(sources).toContain('/zh/xvideo/:path*');
    expect(sources).toContain('/zh/xxvideo/:path*');
  });

  it('never redirects the canonical video path to itself', () => {
    for (const redirect of VIDEO_ALIAS_REDIRECTS) {
      expect(redirect.source).not.toBe(redirect.destination);
      expect(redirect.source).not.toMatch(/^(?:\/zh)?\/video\//);
    }
  });
});
