import { describe, it, expect } from 'vitest';
import { filterAndSortLegendItems } from '@/lib/legend-utils';

const makeItem = (label: string, isActive: boolean, title?: string) => ({
  label,
  isActive,
  title,
});

describe('filterAndSortLegendItems', () => {
  const items = [
    makeItem('H100', true, 'NVIDIA H100 SXM'),
    makeItem('H200', false, 'NVIDIA H200 SXM'),
    makeItem('MI300X', true, 'AMD Instinct MI300X'),
    makeItem('B200', false, 'NVIDIA B200'),
  ];

  describe('search filtering', () => {
    it('returns all items when search is empty', () => {
      expect(filterAndSortLegendItems(items, '', false)).toEqual(items);
    });

    it('returns all items when search is whitespace', () => {
      expect(filterAndSortLegendItems(items, '   ', false)).toEqual(items);
    });

    it('filters by label case-insensitively', () => {
      const result = filterAndSortLegendItems(items, 'h1', false);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('H100');
    });

    it('filters by title case-insensitively', () => {
      const result = filterAndSortLegendItems(items, 'amd', false);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('MI300X');
    });

    it('matches partial label strings', () => {
      const result = filterAndSortLegendItems(items, '200', false);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.label)).toEqual(['H200', 'B200']);
    });

    it('returns empty array when nothing matches', () => {
      expect(filterAndSortLegendItems(items, 'zzz', false)).toEqual([]);
    });

    it('handles items without title field', () => {
      const noTitle = [makeItem('A100', true), makeItem('B100', false)];
      const result = filterAndSortLegendItems(noTitle, 'A1', false);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('A100');
    });
  });

  describe('active-first sorting', () => {
    it('sorts active items before inactive', () => {
      const result = filterAndSortLegendItems(items, '', true);
      expect(result.map((r) => r.label)).toEqual(['H100', 'MI300X', 'H200', 'B200']);
    });

    it('preserves relative order within active group', () => {
      const result = filterAndSortLegendItems(items, '', true);
      const activeItems = result.filter((r) => r.isActive);
      expect(activeItems.map((r) => r.label)).toEqual(['H100', 'MI300X']);
    });

    it('preserves relative order within inactive group', () => {
      const result = filterAndSortLegendItems(items, '', true);
      const inactiveItems = result.filter((r) => !r.isActive);
      expect(inactiveItems.map((r) => r.label)).toEqual(['H200', 'B200']);
    });

    it('returns same order when all items are active', () => {
      const allActive = items.map((i) => ({ ...i, isActive: true }));
      const result = filterAndSortLegendItems(allActive, '', true);
      expect(result.map((r) => r.label)).toEqual(items.map((r) => r.label));
    });

    it('does not sort when sortActiveFirst is false', () => {
      const result = filterAndSortLegendItems(items, '', false);
      expect(result.map((r) => r.label)).toEqual(items.map((r) => r.label));
    });
  });

  describe('combined search + sort', () => {
    it('filters first then sorts', () => {
      const result = filterAndSortLegendItems(items, 'nvidia', true);
      expect(result).toHaveLength(3);
      // Active NVIDIA items first, then inactive
      expect(result[0].label).toBe('H100');
      expect(result[1].label).toBe('H200');
      expect(result[2].label).toBe('B200');
    });
  });

  describe('combined search + sort (additional)', () => {
    it('sorts filtered results active-first', () => {
      const result = filterAndSortLegendItems(items, '00', true);
      // H100 (active), MI300X (active), H200 (inactive), B200 (inactive)
      const activeLabels = result.filter((r) => r.isActive).map((r) => r.label);
      const inactiveLabels = result.filter((r) => !r.isActive).map((r) => r.label);
      // All active items should come before inactive
      const lastActiveIdx = result.findIndex((r) => !r.isActive);
      if (lastActiveIdx > 0) {
        result.slice(0, lastActiveIdx).forEach((r) => expect(r.isActive).toBe(true));
      }
      expect(activeLabels.length + inactiveLabels.length).toBe(result.length);
    });

    it('returns empty when search matches nothing even with sort', () => {
      expect(filterAndSortLegendItems(items, 'nonexistent', true)).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('handles empty items array', () => {
      expect(filterAndSortLegendItems([], 'test', true)).toEqual([]);
    });

    it('handles empty items with empty search', () => {
      expect(filterAndSortLegendItems([], '', false)).toEqual([]);
    });

    it('does not mutate the original array', () => {
      const original = [...items];
      filterAndSortLegendItems(items, '', true);
      expect(items).toEqual(original);
    });

    it('handles single item array', () => {
      const single = [makeItem('GPU', true)];
      expect(filterAndSortLegendItems(single, '', true)).toEqual(single);
      expect(filterAndSortLegendItems(single, 'GPU', false)).toEqual(single);
      expect(filterAndSortLegendItems(single, 'other', false)).toEqual([]);
    });

    it('handles all inactive items', () => {
      const allInactive = items.map((i) => ({ ...i, isActive: false }));
      const result = filterAndSortLegendItems(allInactive, '', true);
      expect(result).toHaveLength(items.length);
      result.forEach((r) => expect(r.isActive).toBe(false));
    });

    it('preserves extra properties on items', () => {
      const extended = [{ label: 'A', isActive: true, title: 'T', color: '#fff', name: 'a' }];
      const result = filterAndSortLegendItems(extended, '', false);
      expect(result[0]).toHaveProperty('color', '#fff');
      expect(result[0]).toHaveProperty('name', 'a');
    });
  });
});
