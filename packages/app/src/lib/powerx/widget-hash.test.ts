import { describe, expect, it } from 'vitest';

import {
  parseWidgetHash,
  readWidgetHash,
  snapNumber,
  snapTo,
  writeWidgetHash,
} from './widget-hash';

describe('widget hash', () => {
  it('reads one namespace out of several and ignores heading anchors', () => {
    expect(readWidgetHash('#pb=b200_fixed_single_600&vd=1_8', 'pb')).toBe('b200_fixed_single_600');
    expect(readWidgetHash('#pb=b200_fixed_single_600&vd=1_8', 'vd')).toBe('1_8');
    expect(readWidgetHash('#reading-the-charts', 'pb')).toBeNull();
    expect(readWidgetHash('', 'pb')).toBeNull();
    expect(parseWidgetHash('#four-ways-to-count-power').size).toBe(0);
  });

  it('writes a namespace while keeping the others and dropping a heading anchor', () => {
    expect(writeWidgetHash('#reading-the-charts', 'pb', 'b200_fixed_single_600')).toBe(
      'pb=b200_fixed_single_600',
    );
    expect(writeWidgetHash('#pb=old&vd=1_8', 'pb', 'new')).toBe('pb=new&vd=1_8');
    expect(writeWidgetHash('#vd=1_8', 'rc', 'hgx_multi_fixed_require')).toBe(
      'vd=1_8&rc=hgx_multi_fixed_require',
    );
  });

  it('round-trips values that need encoding', () => {
    const hash = writeWidgetHash('', 'rc', 'a b&c=d');
    expect(readWidgetHash(`#${hash}`, 'rc')).toBe('a b&c=d');
  });

  it('snaps invalid values to defaults', () => {
    expect(snapTo('multi', ['single', 'multi'], 'single')).toBe('multi');
    expect(snapTo('bogus', ['single', 'multi'], 'single')).toBe('single');
    expect(snapTo(undefined, ['single', 'multi'], 'single')).toBe('single');
    expect(snapNumber('650', 0, 1000, 600)).toBe(650);
    expect(snapNumber('5000', 0, 1000, 600)).toBe(1000);
    expect(snapNumber('-1', 0, 1000, 600)).toBe(0);
    expect(snapNumber('abc', 0, 1000, 600)).toBe(600);
    expect(snapNumber(undefined, 0, 1000, 600)).toBe(600);
  });
});
