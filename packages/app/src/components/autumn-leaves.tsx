import type { CSSProperties } from 'react';

import './autumn-leaves.css';

const LEAVES = [
  { top: '12%', left: '20%', turn: '-28deg', color: '#c65d21', duration: '4.8s' },
  { top: '28%', left: '54%', turn: '38deg', color: '#bb8528', duration: '4.3s' },
  { top: '45%', left: '12%', turn: '-52deg', color: '#a94427', duration: '4.6s' },
  { top: '61%', left: '48%', turn: '22deg', color: '#d68a32', duration: '4.1s' },
  { top: '77%', left: '18%', turn: '-18deg', color: '#bb8528', duration: '4.7s' },
  { top: '91%', left: '52%', turn: '54deg', color: '#c65d21', duration: '4.4s' },
] as const;

export function AutumnLeaves() {
  return (
    <div aria-hidden="true" data-testid="autumn-leaves" className="autumn-leaves">
      {LEAVES.map((leaf) => (
        <span
          key={leaf.top}
          className="autumn-leaf"
          style={
            {
              top: leaf.top,
              left: leaf.left,
              '--leaf-turn': leaf.turn,
              '--leaf-color': leaf.color,
              '--leaf-duration': leaf.duration,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
