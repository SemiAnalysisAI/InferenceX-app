'use client';

import { useEffect } from 'react';
import { haloMusicEnabled } from './halo-music';

export type Cue = 'hover' | 'click' | 'relay' | 'collect' | 'hazard' | 'win';
const notes: Record<Cue, number[]> = {
  hover: [580],
  click: [370, 520],
  relay: [220, 330, 440, 660],
  collect: [640, 880],
  hazard: [190, 115],
  win: [392, 523, 659, 784],
};

export function haloSynth(volume: number) {
  let context: AudioContext | undefined;
  let closed = false;
  return {
    play(cue: Cue) {
      if (closed || !haloMusicEnabled() || !window.AudioContext) return;
      try {
        context ??= new AudioContext();
        const ctx = context;
        if (ctx.state !== 'running') {
          void ctx.resume().catch(() => {});
          if (cue === 'hover') return;
        }
        notes[cue].forEach((hz, i) => {
          const oscillator = ctx.createOscillator();
          const envelope = ctx.createGain();
          const start = ctx.currentTime + i * 0.055;
          oscillator.type = cue === 'hazard' ? 'triangle' : 'sine';
          oscillator.frequency.value = hz;
          envelope.gain.setValueAtTime(0.001, start);
          envelope.gain.exponentialRampToValueAtTime(
            cue === 'hover' ? volume / 3 : volume,
            start + 0.012,
          );
          envelope.gain.exponentialRampToValueAtTime(0.001, start + 0.11);
          oscillator.connect(envelope).connect(ctx.destination);
          oscillator.addEventListener(
            'ended',
            () => {
              oscillator.disconnect();
              envelope.disconnect();
            },
            { once: true },
          );
          oscillator.start(start);
          oscillator.stop(start + 0.12);
        });
      } catch {}
    },
    close() {
      closed = true;
      if (context && context.state !== 'closed') void context.close().catch(() => {});
    },
  };
}

export function HaloInterfaceSound() {
  useEffect(() => {
    const sound = haloSynth(0.035);
    let interacted = false;
    let previous = 0;
    const getControl = (event: Event) =>
      event.target instanceof Element
        ? event.target.closest(
            'button:not(:disabled),a[href],[role="tab"],[role="option"],[role="switch"]',
          )
        : null;
    const click = (event: MouseEvent) => {
      if (!event.isTrusted) return;
      interacted = true;
      const control = getControl(event);
      if (control && !control.closest('[data-halo-game]')) {
        sound.play(
          control instanceof HTMLElement && Object.hasOwn(control.dataset, 'haloTransmission')
            ? 'relay'
            : 'click',
        );
      }
    };
    const hover = (event: PointerEvent) => {
      if (!interacted || event.pointerType !== 'mouse') return;
      const control = getControl(event);
      if (!control || control.closest('[data-halo-game]')) return;
      if (event.relatedTarget instanceof Node && control.contains(event.relatedTarget)) return;
      if (performance.now() - previous < 110) return;
      previous = performance.now();
      sound.play('hover');
    };
    document.addEventListener('click', click);
    document.addEventListener('pointerover', hover, { passive: true });
    return () => {
      document.removeEventListener('click', click);
      document.removeEventListener('pointerover', hover);
      sound.close();
    };
  }, []);
  return null;
}
