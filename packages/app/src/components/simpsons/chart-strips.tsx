'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Radio, Play } from 'lucide-react';
import { ART, type Copy } from './strings';
const selectorForReplay = 'svg[data-testid="d3-chart-svg"]';

/** A separate sibling, never a child of D3's SVG or canvas/export surface. */
export function ChartStrips({
  copy,
  markers,
  toggle,
  cue,
  onSlot,
}: {
  copy: Copy;
  markers: boolean;
  toggle: () => void;
  cue: (chart?: SVGSVGElement) => void;
  onSlot: (node: HTMLDivElement | null) => void;
}) {
  const [mounts, setMounts] = useState<HTMLDivElement[]>([]);
  useEffect(() => {
    const hosts = new Map<Element, HTMLDivElement>();
    const selector = selectorForReplay;
    let frame = 0;
    const sync = () => {
      frame = 0;
      let changed = false;
      for (const [surface, host] of hosts)
        if (!surface.isConnected || !surface.querySelector(selector)) {
          host.remove();
          hosts.delete(surface);
          changed = true;
        }
      for (const svg of document.querySelectorAll(selector)) {
        const surface = svg.closest('figure') ?? svg.closest('[data-slot="card"]');
        if (!surface?.parentElement || hosts.has(surface)) continue;
        const host = document.createElement('div');
        host.className = 'simpsons-chart-mount no-export';
        surface.before(host);
        hosts.set(surface, host);
        changed = true;
      }
      if (changed) setMounts([...hosts.values()]);
    };
    const obs = new MutationObserver((records) => {
      if (
        !frame &&
        records.some((r) =>
          [...r.addedNodes, ...r.removedNodes].some(
            (n) => n instanceof Element && (n.matches(selector) || n.querySelector(selector)),
          ),
        )
      )
        frame = requestAnimationFrame(sync);
    });
    obs.observe(document.body, { subtree: true, childList: true });
    sync();
    return () => {
      obs.disconnect();
      cancelAnimationFrame(frame);
      for (const host of hosts.values()) host.remove();
    };
  }, []);
  return (
    <>
      {mounts.map((host, i) =>
        createPortal(
          <>
            <div className="simpsons-chart-strip">
              {i === 0 && <div className="sp-chart-ticket-slot" ref={onSlot} />}
              <span className="simpsons-transmit">
                <Radio size={15} aria-hidden="true" />
                {copy.live}
              </span>
              <span className="simpsons-channel">{copy.chartShow}</span>
              <div className="simpsons-chart-actions">
                <button
                  type="button"
                  data-simpsons-control=""
                  className="simpsons-marker-toggle"
                  aria-pressed={markers}
                  title={copy.markers}
                  aria-label={copy.markers}
                  onClick={toggle}
                >
                  <img src={`${ART}donut.webp`} alt="" />
                </button>
                <button
                  type="button"
                  data-simpsons-control=""
                  className="simpsons-chart-cue"
                  onClick={() =>
                    cue(
                      host.nextElementSibling?.querySelector<SVGSVGElement>(selectorForReplay) ??
                        undefined,
                    )
                  }
                >
                  <Play size={10} fill="currentColor" aria-hidden="true" />
                  {copy.cue}
                </button>
              </div>
            </div>
            <div className="sp-replay-gutter" aria-hidden="true">
              <div className="sp-set-idle">
                <img src={`${ART}bart-ollie.webp`} alt="" />
                <img src={`${ART}lisa-sax.webp`} alt="" />
              </div>
            </div>
          </>,
          host,
          `station-${i}`,
        ),
      )}
    </>
  );
}
