import type { CSSProperties } from 'react';

/**
 * October decoration: a few leaves drifting down the left edge of the
 * viewport. Pure CSS (no client JS), aria-hidden and pointer-events: none so
 * it never intercepts clicks or reaches assistive tech. Negative delays start
 * each leaf mid-fall so the strip is populated on first paint. Under
 * `prefers-reduced-motion` the leaves rest in place instead of falling.
 */
type LeafShape = 'maple' | 'oval';

interface Leaf {
  shape: LeafShape;
  /** Horizontal position inside the strip, as a percentage. */
  left: number;
  /** Rendered size in px. */
  size: number;
  /** Fall duration in seconds. */
  duration: number;
  /** Negative start offset in seconds. */
  delay: number;
  /** Peak horizontal sway in px. */
  sway: number;
  /** Resting top position (%) used when motion is reduced. */
  rest: number;
  color: string;
  /** Rendered on wide viewports only, keeping phones uncluttered. */
  desktopOnly?: boolean;
}

const LEAVES: readonly Leaf[] = [
  {
    shape: 'maple',
    left: 18,
    size: 32,
    duration: 14,
    delay: -2,
    sway: 18,
    rest: 14,
    color: '#c2410c',
  },
  {
    shape: 'oval',
    left: 62,
    size: 23,
    duration: 17,
    delay: -9,
    sway: 14,
    rest: 33,
    color: '#d97706',
  },
  {
    shape: 'maple',
    left: 40,
    size: 38,
    duration: 19,
    delay: -14,
    sway: 22,
    rest: 55,
    color: '#b91c1c',
  },
  {
    shape: 'oval',
    left: 10,
    size: 26,
    duration: 15,
    delay: -6,
    sway: 16,
    rest: 76,
    color: '#ca8a04',
  },
  {
    shape: 'maple',
    left: 74,
    size: 26,
    duration: 16,
    delay: -11,
    sway: 12,
    rest: 88,
    color: '#ea580c',
    desktopOnly: true,
  },
  {
    shape: 'oval',
    left: 34,
    size: 20,
    duration: 21,
    delay: -17,
    sway: 20,
    rest: 44,
    color: '#9a3412',
    desktopOnly: true,
  },
  {
    shape: 'maple',
    left: 55,
    size: 29,
    duration: 18,
    delay: -4,
    sway: 16,
    rest: 66,
    color: '#d97706',
    desktopOnly: true,
  },
  {
    shape: 'maple',
    left: 22,
    size: 28,
    duration: 20,
    delay: -12,
    sway: 18,
    rest: 6,
    color: '#c2410c',
    desktopOnly: true,
  },
  {
    shape: 'oval',
    left: 82,
    size: 22,
    duration: 13,
    delay: -8,
    sway: 10,
    rest: 22,
    color: '#b45309',
    desktopOnly: true,
  },
];

const MAPLE_PATH =
  'M12 1l1.5 4.5 2.5-1-.5 4.5 4-2.5-.5 3 4 .5-3 3 1 1.5-5 1 .5 2.5-4-1.5V23h-1v-6.5l-4 1.5.5-2.5-5-1 1-1.5-3-3 4-.5-.5-3 4 2.5L8 4.5l2.5 1z';
const OVAL_PATH =
  'M12 2C7 6 4.5 10 5 14.5c.5 4 3.5 6.5 7 7.5 3.5-1 6.5-3.5 7-7.5C19.5 10 17 6 12 2z';

function LeafGlyph({ shape, color }: { shape: LeafShape; color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" focusable="false">
      <path d={shape === 'maple' ? MAPLE_PATH : OVAL_PATH} fill={color} />
      {shape === 'oval' && (
        <path d="M12 4.5V23" stroke="rgba(0,0,0,0.25)" strokeWidth="0.9" fill="none" />
      )}
    </svg>
  );
}

export function AutumnLeaves() {
  return (
    <div aria-hidden="true" data-testid="autumn-leaves" className="autumn-leaves">
      {LEAVES.map((leaf, i) => (
        <span
          key={i}
          data-testid="autumn-leaf"
          className={leaf.desktopOnly ? 'autumn-leaf hidden sm:block' : 'autumn-leaf'}
          style={
            {
              '--leaf-left': `${leaf.left}%`,
              '--leaf-size': `${leaf.size}px`,
              '--leaf-duration': `${leaf.duration}s`,
              '--leaf-delay': `${leaf.delay}s`,
              '--leaf-sway': `${leaf.sway}px`,
              '--leaf-rest': `${leaf.rest}%`,
            } as CSSProperties
          }
        >
          <span className="autumn-leaf-sway">
            <LeafGlyph shape={leaf.shape} color={leaf.color} />
          </span>
        </span>
      ))}
    </div>
  );
}
