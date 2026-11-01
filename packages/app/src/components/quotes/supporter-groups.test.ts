import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { QUOTES, type Quote } from './quotes-data';
import {
  CURATED_SUPPORTER_GROUPS,
  SUPPORTER_GROUPS,
  buildSupporterGroups,
} from './supporter-groups';

const LOGO_DIR = path.resolve(__dirname, '../../../public/logos');
const quotedOrgsWithLogo = [...new Set(QUOTES.filter((q) => q.logo).map((q) => q.org))];

describe('supporter logo wall groups', () => {
  it('keeps the curated group order and appends Other last', () => {
    expect(SUPPORTER_GROUPS.map((g) => g.id)).toEqual([
      'chinese-frontier-labs',
      'us-labs',
      'hyperscalers-clouds',
      'open-source',
      'silicon-neoclouds-academia',
      'other',
    ]);
  });

  it('labels every group in English and Chinese', () => {
    for (const group of SUPPORTER_GROUPS) {
      expect(group.label.en.trim(), group.id).not.toBe('');
      expect(group.label.zh, group.id).toMatch(/\p{Script=Han}/u);
    }
    expect(SUPPORTER_GROUPS.at(-1)?.label).toEqual({ en: 'Other', zh: '其他' });
  });

  it('places every quoted org with a logo on the wall exactly once', () => {
    const placed = SUPPORTER_GROUPS.flatMap((g) => g.logos.flatMap((l) => l.quoteOrg ?? []));
    expect(placed.toSorted()).toEqual(quotedOrgsWithLogo.toSorted());
  });

  it('only links tiles to orgs that have a quote on the page', () => {
    const quoted = new Set(QUOTES.map((q) => q.org));
    for (const group of SUPPORTER_GROUPS) {
      for (const item of group.logos) {
        if (item.quoteOrg) expect(quoted.has(item.quoteOrg), item.quoteOrg).toBe(true);
      }
    }
  });

  it('puts quoted orgs that fit no curated group into Other', () => {
    const other = SUPPORTER_GROUPS.find((g) => g.id === 'other');
    expect(other?.logos.map((l) => l.quoteOrg)).toEqual(
      expect.arrayContaining(['WEKA', 'Red Hat', 'UC San Diego', 'Core42', 'Tensormesh']),
    );
    const curatedOrgs = new Set(
      CURATED_SUPPORTER_GROUPS.flatMap((g) => g.logos.flatMap((l) => l.quoteOrg ?? [])),
    );
    for (const item of other?.logos ?? []) expect(curatedOrgs.has(item.quoteOrg!)).toBe(false);
  });

  it('routes a newly added quote into Other and skips quotes without a logo', () => {
    const extra: Quote[] = [
      ...QUOTES,
      { text: 't', name: 'n', title: 't', org: 'New Org', logo: 'new-org.svg' },
      { text: 't', name: 'n', title: 't', org: 'No Logo Org' },
    ];
    const other = buildSupporterGroups(extra).at(-1);
    expect(other?.id).toBe('other');
    expect(other?.logos.at(-1)).toEqual({
      label: 'New Org',
      logo: 'new-org.svg',
      quoteOrg: 'New Org',
    });
    expect(other?.logos.some((l) => l.quoteOrg === 'No Logo Org')).toBe(false);
  });

  it('omits Other when every quoted org is already curated', () => {
    const curatedOnly = QUOTES.filter((q) => q.org === 'OpenAI');
    expect(buildSupporterGroups(curatedOnly).map((g) => g.id)).not.toContain('other');
  });

  it('references existing logo files and the color Google mark', () => {
    for (const group of SUPPORTER_GROUPS) {
      for (const item of group.logos) {
        expect(existsSync(path.join(LOGO_DIR, item.logo)), item.logo).toBe(true);
      }
    }
    const brandLogos = SUPPORTER_GROUPS.flatMap((g) => g.logos.map((l) => l.logo));
    expect(brandLogos).toContain('google-color.svg');
    expect(brandLogos).not.toContain('google.svg');
  });
});
