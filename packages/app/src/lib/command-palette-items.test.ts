import { describe, expect, it } from 'vitest';

import { getAllChipRouteSlugs, getChipPage } from '@/lib/chip-pages';
import {
  buildPaletteNavItems,
  PALETTE_CHIPS,
  PALETTE_GROUP_LABELS,
  type PaletteGroupKey,
} from '@/lib/command-palette-items';
import { ACTIVE_INFERENCE_MODEL_SLUGS } from '@/lib/inference-model-slug';
import { hasZhSibling } from '@/lib/i18n';
import { matchesSearch } from '@/lib/search-match';

describe('buildPaletteNavItems', () => {
  const en = buildPaletteNavItems('en');
  const zh = buildPaletteNavItems('zh');

  it('produces unique ids and rooted hrefs', () => {
    const ids = en.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of en) {
      expect(item.href.startsWith('/')).toBe(true);
      expect(item.label.length).toBeGreaterThan(0);
    }
  });

  it('mirrors the same catalog across locales', () => {
    expect(zh.map((item) => item.id)).toEqual(en.map((item) => item.id));
    expect(zh.map((item) => item.href)).toEqual(en.map((item) => item.href));
    for (const item of zh) expect(item.label.length).toBeGreaterThan(0);
  });

  it('covers every group and labels each group in both locales', () => {
    const groups = new Set(en.map((item) => item.group));
    for (const key of Object.keys(PALETTE_GROUP_LABELS) as PaletteGroupKey[]) {
      expect(groups.has(key)).toBe(true);
      expect(PALETTE_GROUP_LABELS[key].en.length).toBeGreaterThan(0);
      expect(PALETTE_GROUP_LABELS[key].zh.length).toBeGreaterThan(0);
    }
  });

  it('includes one entry per active inference model', () => {
    const modelItems = en.filter((item) => item.group === 'models');
    expect(modelItems.map((item) => item.id)).toEqual(
      ACTIVE_INFERENCE_MODEL_SLUGS.map((m) => `model:${m.slug}`),
    );
    for (const item of modelItems) {
      expect(item.href.startsWith('/inference/')).toBe(true);
    }
  });

  it('dashboard tabs are searchable via the header label in both locales', () => {
    // The header calls this section "Dashboard" / 「仪表板」 — the words users
    // actually see must hit every dashboard destination.
    for (const items of [en, zh]) {
      for (const item of items.filter((i) => i.group === 'dashboard')) {
        expect(item.keywords).toContain('dashboard');
        expect(item.keywords).toContain('仪表板');
      }
    }
  });

  it('every href with a zh sibling resolves; dashboard/page hrefs are mirrored', () => {
    // All palette destinations should exist in the English tree; the mirrored
    // ones (all of them today) must round-trip through hasZhSibling.
    for (const item of en) {
      expect(hasZhSibling(item.href)).toBe(true);
    }
  });

  it('finds models from punctuation-less queries via label + keywords', () => {
    const kimi = en.find((item) => item.id.startsWith('model:kimi-k3'));
    expect(kimi).toBeDefined();
    expect(matchesSearch('kimi k3', kimi!.label, kimi!.keywords)).toBe(true);
  });
});

describe('PALETTE_CHIPS stays in sync with chip-pages', () => {
  it('every palette chip slug is a real /chips/[slug] page with a matching title', () => {
    for (const chip of PALETTE_CHIPS) {
      const page = getChipPage(chip.slug);
      expect(page, `unknown chip slug ${chip.slug}`).toBeDefined();
      expect(chip.label).toBe(page!.title);
    }
  });

  it('every chip page is in the palette (versus pages excluded by design)', () => {
    const paletteSlugs = new Set(PALETTE_CHIPS.map((chip) => chip.slug));
    const chipOnlySlugs = getAllChipRouteSlugs().filter((slug) => !slug.includes('-vs-'));
    for (const slug of chipOnlySlugs) {
      expect(paletteSlugs.has(slug), `chip page ${slug} missing from palette`).toBe(true);
    }
  });
});
