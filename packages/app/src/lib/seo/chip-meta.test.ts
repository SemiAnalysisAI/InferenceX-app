import { describe, expect, it } from 'vitest';

import { getAllChipPages, getAllChipVsPages, getChipPage } from '@/lib/catalog/chip-pages';
import { META_DESCRIPTION_MAX, META_TITLE_MAX } from '@/lib/seo/meta-text';

import {
  chipMetaDescription,
  chipMetaTitle,
  chipVsMetaDescription,
  chipVsMetaTitle,
} from './chip-meta';

describe('chip meta descriptions', () => {
  it('leads with the specs people search for: memory, bandwidth, TDP, power and price', () => {
    const description = chipMetaDescription(getChipPage('gb300-nvl72')!, 'en');
    expect(description.startsWith('GB300 NVL72 specs: ')).toBe(true);
    for (const fact of ['HBM3e', 'TB/s bandwidth', 'W TDP', 'kW all-in power', '/hr cloud price']) {
      expect(description).toContain(fact);
    }
  });

  it('fits every chip and versus page within the locale limit', () => {
    for (const locale of ['en', 'zh'] as const) {
      for (const entry of getAllChipPages()) {
        expect(chipMetaDescription(entry, locale).length).toBeLessThanOrEqual(
          META_DESCRIPTION_MAX[locale],
        );
      }
      for (const page of getAllChipVsPages()) {
        const description = chipVsMetaDescription(page, locale);
        expect(description.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX[locale]);
        expect(description).toContain(page.a.label);
        expect(description).toContain(page.b.label);
      }
    }
  });

  it('fits every chip and versus page title within the title budget, without an ellipsis', () => {
    for (const locale of ['en', 'zh'] as const) {
      for (const entry of getAllChipPages()) {
        const title = chipMetaTitle(entry, locale);
        expect(title.length).toBeLessThanOrEqual(META_TITLE_MAX);
        expect(title.startsWith(entry.title)).toBe(true);
      }
      for (const page of getAllChipVsPages()) {
        const title = chipVsMetaTitle(page, locale);
        expect(title.length).toBeLessThanOrEqual(META_TITLE_MAX);
        expect(title.startsWith(`${page.a.label} vs ${page.b.label}`)).toBe(true);
      }
    }
  });

  it('keeps the full descriptor when it fits and drops it for long versus pairs', () => {
    const pages = getAllChipVsPages();
    const short = pages.find((p) => `${p.a.label} vs ${p.b.label}`.length <= 25)!;
    expect(chipVsMetaTitle(short, 'en')).toBe(
      `${short.a.label} vs ${short.b.label}: Specs, Price & Power`,
    );
    const long = pages.find((p) => `${p.a.label} vs ${p.b.label}`.length > 25)!;
    expect(chipVsMetaTitle(long, 'en')).not.toContain('Power');
  });
});
