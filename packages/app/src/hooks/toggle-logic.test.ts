import { describe, it, expect } from 'vitest';

import { computeToggle } from '@/hooks/useTogglableSet';

const ALL = new Set(['a', 'b', 'c']);

// ===========================================================================
// computeToggle
// ===========================================================================
describe('computeToggle', () => {
  describe('when all items are active (solo behavior)', () => {
    it('solos the toggled item when all are active', () => {
      const prev = new Set(['a', 'b', 'c']);
      const result = computeToggle(prev, 'b', ALL);
      expect(result).toEqual(new Set(['b']));
    });

    it('solos the first item', () => {
      const prev = new Set(['a', 'b', 'c']);
      const result = computeToggle(prev, 'a', ALL);
      expect(result).toEqual(new Set(['a']));
    });

    it('solos the last item', () => {
      const prev = new Set(['a', 'b', 'c']);
      const result = computeToggle(prev, 'c', ALL);
      expect(result).toEqual(new Set(['c']));
    });
  });

  describe('when only one item is active (restore all behavior)', () => {
    it('restores all items when the solo item is toggled again', () => {
      const prev = new Set(['b']);
      const result = computeToggle(prev, 'b', ALL);
      expect(result).toEqual(ALL);
    });

    it('restores all items regardless of which single item is active', () => {
      const prev = new Set(['a']);
      const result = computeToggle(prev, 'a', ALL);
      expect(result).toEqual(ALL);
    });
  });

  describe('when some (but not all/one) items are active', () => {
    it('removes an active item', () => {
      const prev = new Set(['a', 'b']);
      const result = computeToggle(prev, 'a', ALL);
      expect(result).toEqual(new Set(['b']));
    });

    it('removes the other active item', () => {
      const prev = new Set(['a', 'b']);
      const result = computeToggle(prev, 'b', ALL);
      expect(result).toEqual(new Set(['a']));
    });
  });

  describe('when adding an inactive item', () => {
    it('adds an inactive item to the set', () => {
      const prev = new Set(['a']);
      const result = computeToggle(prev, 'b', ALL);
      expect(result).toEqual(new Set(['a', 'b']));
    });

    it('adds to an empty set', () => {
      const prev = new Set<string>();
      const result = computeToggle(prev, 'a', ALL);
      expect(result).toEqual(new Set(['a']));
    });

    it('completing the set (adding last missing item)', () => {
      const prev = new Set(['a', 'b']);
      const result = computeToggle(prev, 'c', ALL);
      expect(result).toEqual(new Set(['a', 'b', 'c']));
    });
  });

  describe('edge cases', () => {
    it('handles single-item allItems set: toggle on → solo = same, toggle off → restore = same', () => {
      const singleAll = new Set(['x']);
      // all active, toggle 'x' → solo 'x' (same as all)
      const result1 = computeToggle(new Set(['x']), 'x', singleAll);
      expect(result1).toEqual(new Set(['x']));
    });

    it('handles two-item allItems set: solo then restore', () => {
      const twoAll = new Set(['a', 'b']);
      // all active → solo 'a'
      const step1 = computeToggle(new Set(['a', 'b']), 'a', twoAll);
      expect(step1).toEqual(new Set(['a']));
      // solo 'a' → restore all
      const step2 = computeToggle(step1, 'a', twoAll);
      expect(step2).toEqual(twoAll);
    });

    it('does not mutate the previous set', () => {
      const prev = new Set(['a', 'b']);
      computeToggle(prev, 'c', ALL);
      expect(prev).toEqual(new Set(['a', 'b'])); // unchanged
    });

    it('does not mutate the allItems set', () => {
      const allCopy = new Set(ALL);
      computeToggle(new Set(['a']), 'a', ALL);
      expect(ALL).toEqual(allCopy); // unchanged
    });

    it('full cycle: all → solo → restore all', () => {
      const step1 = computeToggle(new Set(['a', 'b', 'c']), 'b', ALL); // solo b
      expect(step1).toEqual(new Set(['b']));
      const step2 = computeToggle(step1, 'b', ALL); // restore all
      expect(step2).toEqual(ALL);
    });

    it('full cycle: all → solo → add → remove → single → restore', () => {
      const s1 = computeToggle(new Set(['a', 'b', 'c']), 'a', ALL); // solo a
      expect(s1).toEqual(new Set(['a']));
      const s2 = computeToggle(s1, 'b', ALL); // add b
      expect(s2).toEqual(new Set(['a', 'b']));
      const s3 = computeToggle(s2, 'a', ALL); // remove a
      expect(s3).toEqual(new Set(['b']));
      const s4 = computeToggle(s3, 'b', ALL); // restore all (only b active)
      expect(s4).toEqual(ALL);
    });
  });

  describe('empty allItems', () => {
    it('adds item to empty prev when allItems is empty', () => {
      const result = computeToggle(new Set(), 'a', new Set());
      expect(result).toEqual(new Set(['a']));
    });

    it('returns allItems (empty) when prev has one item and that item is toggled off with empty allItems', () => {
      // prev.size === 1 && isActive → restore all → returns allItems (empty set)
      const result = computeToggle(new Set(['a']), 'a', new Set());
      expect(result).toEqual(new Set());
    });
  });

  describe('item not in allItems', () => {
    it('solos when prev equals allItems size, even if toggled item is not in allItems', () => {
      // allAreActive check is purely size-based, not membership-based
      const allItems = new Set(['a', 'b']);
      const prev = new Set(['a', 'x']); // same size as allItems but different members
      // 'x' is active and allAreActive (by size), so → solo
      const result = computeToggle(prev, 'x', allItems);
      expect(result).toEqual(new Set(['x']));
    });

    it('adds an unknown item when prev is a subset', () => {
      const allItems = new Set(['a', 'b', 'c']);
      const prev = new Set(['a']);
      const result = computeToggle(prev, 'z', allItems);
      expect(result).toEqual(new Set(['a', 'z']));
    });
  });

  describe('return type guarantees', () => {
    it('always returns a new Set instance (never the same reference as prev)', () => {
      const allItems = new Set(['a', 'b', 'c']);

      // solo case
      const prev1 = new Set(['a', 'b', 'c']);
      expect(computeToggle(prev1, 'a', allItems)).not.toBe(prev1);

      // add case
      const prev2 = new Set(['a']);
      expect(computeToggle(prev2, 'b', allItems)).not.toBe(prev2);

      // remove case
      const prev3 = new Set(['a', 'b']);
      expect(computeToggle(prev3, 'a', allItems)).not.toBe(prev3);
    });

    it('returns allItems reference directly in restore-all case', () => {
      const allItems = new Set(['a', 'b', 'c']);
      const prev = new Set(['b']); // solo → restore all
      const result = computeToggle(prev, 'b', allItems);
      // computeToggle returns allItems directly (same reference)
      expect(result).toBe(allItems);
    });
  });

  describe('large sets', () => {
    it('handles 100 items correctly in solo/restore cycle', () => {
      const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
      const allItems = new Set(items);
      const prev = new Set(items);

      // solo item-50
      const step1 = computeToggle(prev, 'item-50', allItems);
      expect(step1.size).toBe(1);
      expect(step1.has('item-50')).toBe(true);

      // restore all
      const step2 = computeToggle(step1, 'item-50', allItems);
      expect(step2.size).toBe(100);
    });
  });
});
