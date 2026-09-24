import { describe, expect, it } from 'vitest';
import { PARAM_DEFAULTS } from '@/lib/url-state';
import { SHARE_CONTROL_COVERAGE } from './control-coverage';
import { VIEW_QUERY_PARAMS } from './registry';

describe('persisted frontend controls', () => {
  it('requires a disposition for every share-link control, not just a dashboard route', () => {
    expect(Object.keys(SHARE_CONTROL_COVERAGE).sort()).toEqual(Object.keys(PARAM_DEFAULTS).sort());
    for (const control of Object.values(SHARE_CONTROL_COVERAGE)) {
      if ('view' in control) expect(VIEW_QUERY_PARAMS[control.view]).toContain(control.param);
      else expect('derived' in control ? control.derived : control.rendering).toBeTruthy();
    }
  });
});
