import { describe, expect, it } from 'vitest';

import { eyebrowVariants } from './eyebrow';
import { headingVariants } from './heading';
import { cn } from '@/lib/utils';

describe('headingVariants', () => {
  it('renders the page-title recipe used across route h1s', () => {
    expect(headingVariants({ level: 'page' })).toBe(
      'text-foreground text-2xl lg:text-4xl font-bold tracking-tight',
    );
  });

  it('defaults to the section level', () => {
    expect(headingVariants({})).toContain('text-xl');
  });
});

describe('eyebrowVariants', () => {
  it('matches the dominant eyebrow recipe by default', () => {
    const classes = eyebrowVariants({});
    for (const cls of [
      'font-mono',
      'text-xs',
      'font-semibold',
      'uppercase',
      'text-brand',
      'tracking-eyebrow',
    ]) {
      expect(classes).toContain(cls);
    }
  });

  it('switches to wide tracking', () => {
    expect(eyebrowVariants({ wide: true })).toContain('tracking-eyebrow-wide');
    expect(eyebrowVariants({ wide: true })).not.toContain('tracking-eyebrow ');
  });
});

describe('cn merging of custom typography tokens', () => {
  it('resolves conflicts between named tracking tokens and built-ins (last wins)', () => {
    expect(cn('tracking-eyebrow', 'tracking-tight')).toBe('tracking-tight');
    expect(cn('tracking-tight', 'tracking-eyebrow')).toBe('tracking-eyebrow');
    expect(cn('tracking-eyebrow', 'tracking-eyebrow-wide')).toBe('tracking-eyebrow-wide');
  });

  it('resolves conflicts between micro size tokens and the standard scale', () => {
    expect(cn('text-sm', 'text-2xs')).toBe('text-2xs');
    expect(cn('text-3xs', 'text-lg')).toBe('text-lg');
  });
});
