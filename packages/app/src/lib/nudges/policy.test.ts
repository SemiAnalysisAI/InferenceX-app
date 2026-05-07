import { describe, expect, it } from 'vitest';

import { dismissesOnAction } from './policy';
import type { NudgeDefinition, NudgeType } from './types';

function makeNudge(type: NudgeType, dismissOnAction?: boolean): NudgeDefinition {
  return {
    id: 'test',
    type,
    trigger: { type: 'immediate' },
    dismissal: { type: 'session' },
    storageKey: 'test-key',
    priority: 0,
    scope: 'dashboard',
    content: {
      icon: () => null,
      title: 'Title',
      description: 'Description',
      testId: 'test-nudge',
    },
    ...(dismissOnAction === undefined ? {} : { dismissOnAction }),
  };
}

describe('dismissesOnAction', () => {
  it('returns true for toast by default', () => {
    expect(dismissesOnAction(makeNudge('toast'))).toBe(true);
  });

  it('returns true for modal by default', () => {
    expect(dismissesOnAction(makeNudge('modal'))).toBe(true);
  });

  it('returns false for banner by default', () => {
    expect(dismissesOnAction(makeNudge('banner'))).toBe(false);
  });

  it('respects explicit dismissOnAction: false on a toast', () => {
    expect(dismissesOnAction(makeNudge('toast', false))).toBe(false);
  });

  it('respects explicit dismissOnAction: false on a modal', () => {
    expect(dismissesOnAction(makeNudge('modal', false))).toBe(false);
  });

  it('respects explicit dismissOnAction: true on a banner', () => {
    expect(dismissesOnAction(makeNudge('banner', true))).toBe(true);
  });
});
