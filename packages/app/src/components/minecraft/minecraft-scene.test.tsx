// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import MinecraftScene from './minecraft-scene';

vi.mock('@react-three/fiber', () => ({ Canvas: () => null }));
vi.mock('./minecraft-blocks', () => ({ FloatingBlocks: () => null }));

describe('MinecraftScene', () => {
  it('does not attach pointer listeners to a decorative canvas during late initialization', () => {
    const canvas = MinecraftScene();
    const events = canvas.props.events();
    expect(events.enabled).toBe(false);
    expect(events.connect).toBeUndefined();
    expect(events.handlers).toBeUndefined();
  });
});
