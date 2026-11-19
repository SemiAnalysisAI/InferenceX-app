import { describe, expect, it } from 'vitest';

import type { Quote } from './quotes-data';
import { balancedRowSize, buildSupporterGroups, type SupporterGroup } from './supporter-groups';

const curated: SupporterGroup[] = [
  {
    id: 'labs',
    label: { en: 'Labs', zh: '实验室' },
    logos: [{ label: 'OpenAI', logo: 'openai.svg', quoteOrg: 'OpenAI' }],
  },
];

function quote(org: string, logo?: string): Quote {
  return { text: 'A useful benchmark.', name: 'Reviewer', title: 'Engineer', org, logo };
}

describe('buildSupporterGroups', () => {
  it('appends unplaced quote logos once, skipping missing logos and curated organizations', () => {
    const groups = buildSupporterGroups(
      [
        quote('OpenAI', 'openai.svg'),
        quote('New Org', 'new-org.svg'),
        quote('New Org', 'new-org.svg'),
        quote('No Logo'),
      ],
      curated,
    );

    expect(groups).toEqual([
      curated[0],
      {
        id: 'other',
        label: { en: 'Other', zh: '其他' },
        logos: [{ label: 'New Org', logo: 'new-org.svg', quoteOrg: 'New Org' }],
      },
    ]);
  });

  it('omits Other when no remaining logos exist', () => {
    expect(buildSupporterGroups([quote('OpenAI', 'openai.svg')], curated)).toEqual(curated);
    expect(buildSupporterGroups([], [])).toEqual([]);
  });
});

describe('balancedRowSize', () => {
  it('keeps groups that fit on one row whole', () => {
    expect(balancedRowSize(5, 10)).toBe(5);
    expect(balancedRowSize(8, 8)).toBe(8);
  });

  it('splits uneven groups into evenly filled rows', () => {
    expect(balancedRowSize(9, 8)).toBe(5);
    expect(balancedRowSize(11, 6)).toBe(6);
    expect(balancedRowSize(15, 8)).toBe(8);
    expect(balancedRowSize(17, 8)).toBe(6);
  });
});
