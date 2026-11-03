import { describe, expect, it } from 'vitest';

import type { Quote } from './quotes-data';
import { buildSupporterGroups, type SupporterGroup } from './supporter-groups';

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

  it('preserves static Other logos and appends unplaced quotes without duplicating a seeded org', () => {
    const groups = buildSupporterGroups(
      [quote('WEKA', 'weka.svg'), quote('Stanford', 'stanford.svg')],
      [
        {
          id: 'other',
          label: { en: 'Other', zh: '其他' },
          logos: [
            { label: 'TokenSpeed', logo: 'tokenspeed.webp' },
            { label: 'WEKA', logo: 'weka.svg', quoteOrg: 'WEKA' },
          ],
        },
        ...curated,
      ],
    );

    expect(groups.map((group) => group.id)).toEqual(['labs', 'other']);
    expect(groups[1].logos).toEqual([
      { label: 'TokenSpeed', logo: 'tokenspeed.webp' },
      { label: 'WEKA', logo: 'weka.svg', quoteOrg: 'WEKA' },
      { label: 'Stanford', logo: 'stanford.svg', quoteOrg: 'Stanford' },
    ]);
  });

  it('omits Other when no remaining logos exist', () => {
    expect(buildSupporterGroups([quote('OpenAI', 'openai.svg')], curated)).toEqual(curated);
    expect(buildSupporterGroups([], [])).toEqual([]);
  });
});
