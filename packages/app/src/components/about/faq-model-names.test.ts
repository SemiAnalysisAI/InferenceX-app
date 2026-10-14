import { describe, expect, it } from 'vitest';

import { GENERATED_FAQ_DATA } from './faq';

describe('About FAQ model list', () => {
  // Rendered as <li key={name}>; a repeated display name duplicates a React key
  // and lists the same model twice. Point releases that share a dashboard
  // bucket need their own override in GENERATED_FAQ_DATA.modelNames.
  it('lists every model name once, including point releases', () => {
    const names = GENERATED_FAQ_DATA.modelNames;
    expect(names.filter((name, i) => names.indexOf(name) !== i)).toEqual([]);
    expect(names).toContain('GLM-5.2');
    expect(names).toContain('GLM-5.3');
  });
});
