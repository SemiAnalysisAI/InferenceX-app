import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldHideArms } from './viewmodel-visibility.mjs';
test('team arm selection does not treat ct_arms as a Terrorist-arm match', () => {
  assert.equal(shouldHideArms('ct_arms_reference', 'CT'), false);
  assert.equal(shouldHideArms('t_arms_reference', 'CT'), true);
  assert.equal(shouldHideArms('ct_arms_reference', 'T'), true);
  assert.equal(shouldHideArms('t_arms_reference', 'T'), false);
  assert.equal(shouldHideArms('weapon_receiver', 'CT'), false);
});
