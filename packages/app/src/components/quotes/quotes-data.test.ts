import { describe, expect, it } from 'vitest';

import { CAROUSEL_LABELS, CAROUSEL_ORGS, QUOTES } from './quotes-data';

/**
 * The landing carousel renders `QUOTES` filtered by `CAROUSEL_ORGS`, while the
 * /quotes page renders every entry in `QUOTES`. That split is what lets a
 * supporter come off the carousel without being dropped from the site, so it is
 * asserted here rather than left implicit.
 */
const OFF_CAROUSEL_ONLY = ['Together AI', 'Nebius', 'White House', 'UC San Diego'] as const;

describe('quote carousel membership', () => {
  it('keeps every carousel org backed by a real quote', () => {
    const quotedOrgs = new Set(QUOTES.map((quote) => quote.org));
    for (const org of CAROUSEL_ORGS) {
      expect(quotedOrgs.has(org), `${org} is in CAROUSEL_ORGS but has no quote`).toBe(true);
    }
  });

  it('lists each carousel org once', () => {
    expect(new Set(CAROUSEL_ORGS).size).toBe(CAROUSEL_ORGS.length);
  });

  it.each(OFF_CAROUSEL_ONLY)('excludes %s from the carousel', (org) => {
    expect((CAROUSEL_ORGS as readonly string[]).includes(org)).toBe(false);
  });

  it.each(OFF_CAROUSEL_ONLY)('still shows %s on the quotes page', (org) => {
    expect(QUOTES.some((quote) => quote.org === org)).toBe(true);
  });

  it('resolves carousel display labels for the orgs that use them', () => {
    // Overrides may outlive carousel membership (see the note in quotes-data),
    // so only assert that active carousel orgs resolve to a non-empty label.
    for (const org of CAROUSEL_ORGS) {
      expect(CAROUSEL_LABELS[org] ?? org).not.toBe('');
    }
  });
});
