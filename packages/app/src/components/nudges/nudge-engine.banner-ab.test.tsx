// @test-environment jsdom
import { describe, expect, it, vi } from 'bun:test';

import { NUDGE_REGISTRY } from '@/lib/nudges/registry';
import type { NudgeDefinition } from '@/lib/nudges/types';
import { click, get, render } from '@/test/dom';

import { BannerRenderer } from './nudge-engine';

const arms = NUDGE_REGISTRY.filter((nudge) => nudge.variant);

describe('Landing banner A/B arms', () => {
  // Before the arm resolves after hydration, every arm is rendered and the engine's active banner
  // can be the hidden one. Handlers must act on the arm that was clicked, not on engine state.
  it('hands each arm its own definition on click and dismiss', () => {
    const onAction = vi.fn<(def: NudgeDefinition) => void>();
    const onDismiss = vi.fn<(def: NudgeDefinition) => void>();
    render(
      <div>
        {arms.map((arm) => (
          <BannerRenderer key={arm.id} def={arm} onAction={onAction} onDismiss={onDismiss} />
        ))}
      </div>,
    );

    const operatorx = get('[data-banner-variant="operatorx"] [data-testid="launch-banner"]');
    expect(operatorx.getAttribute('href')).toBe('/opx');
    click(operatorx);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0].variant).toBe('operatorx');

    click(get('[data-banner-variant="operatorx"] [data-testid="launch-banner-dismiss"]'));
    expect(onDismiss.mock.calls[0][0].variant).toBe('operatorx');

    click(get('[data-banner-variant="ubenchx"] [data-testid="launch-banner"]'));
    const def = onAction.mock.calls[1][0];
    expect(def.variant).toBe('ubenchx');
    expect(def.analytics?.properties?.variant).toBe('ubenchx');
  });
});
