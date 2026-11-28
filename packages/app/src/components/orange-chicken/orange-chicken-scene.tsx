'use client';

/**
 * The background scene: paper lanterns swaying along the top edge, steam drifting up from a
 * kitchen counter along the bottom. Fixed behind the page, never interactive, and hidden for
 * print and forced colours (see the theme CSS).
 */

function Lantern() {
  return (
    <svg viewBox="0 0 64 110" aria-hidden="true" focusable="false">
      <path d="M32 0V16" stroke="#4a1e0a" strokeWidth="2" />
      <rect
        x="20"
        y="14"
        width="24"
        height="7"
        rx="2"
        fill="#f6b93b"
        stroke="#4a1e0a"
        strokeWidth="2"
      />
      <ellipse cx="32" cy="50" rx="28" ry="30" fill="#c8321c" stroke="#4a1e0a" strokeWidth="2.5" />
      <path
        d="M32 20c-13 9-13 51 0 60m0-60c13 9 13 51 0 60M10 36c14 7 30 7 44 0M10 64c14-7 30-7 44 0"
        fill="none"
        stroke="#7d1d0e"
        strokeWidth="1.8"
      />
      <ellipse cx="22" cy="38" rx="5" ry="10" fill="#ff8a6a" opacity=".45" />
      <rect
        x="20"
        y="78"
        width="24"
        height="7"
        rx="2"
        fill="#f6b93b"
        stroke="#4a1e0a"
        strokeWidth="2"
      />
      <path d="M32 85V100M26 100h12l-2 8h-8Z" fill="#f6b93b" stroke="#4a1e0a" strokeWidth="2" />
    </svg>
  );
}

function Counter() {
  return (
    <svg
      viewBox="0 0 1440 150"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0" y="118" width="1440" height="32" fill="#b9400c" opacity=".35" />
      <path d="M0 118H1440" stroke="#4a1e0a" strokeWidth="3" />
      <path d="M0 134H1440" stroke="#4a1e0a" strokeWidth="1.5" strokeDasharray="2 10" />
      {/* bamboo steamer stack */}
      <g transform="translate(120 28)" stroke="#4a1e0a" strokeWidth="3" strokeLinejoin="round">
        <rect x="0" y="62" width="104" height="28" rx="6" fill="#e2b365" />
        <rect x="4" y="34" width="96" height="28" rx="6" fill="#d9a653" />
        <rect x="8" y="8" width="88" height="26" rx="6" fill="#e2b365" />
        <path d="M30 4q22-12 44 0Z" fill="#c98a12" />
        <path
          d="M22 62v28M52 62v28M82 62v28M26 34v28M52 34v28M78 34v28"
          strokeWidth="1.5"
          fill="none"
        />
      </g>
      {/* wok on the flame */}
      <g transform="translate(980 20)" stroke="#4a1e0a" strokeWidth="3" strokeLinejoin="round">
        <g className="oc-flame">
          <path
            d="M20 98c-6-14 6-20 2-34 12 8 12 20 8 26 4-4 8-4 8-14 10 12 8 26-2 38Z"
            fill="#f6803a"
          />
          <path d="M44 98c-4-10 4-14 2-24 8 6 8 14 5 20Z" fill="#ffd45c" strokeWidth="2" />
          <path
            d="M70 98c-6-14 6-20 2-34 12 8 12 20 8 26 4-4 8-4 8-14 10 12 8 26-2 38Z"
            fill="#f6803a"
          />
        </g>
        <path d="M-30 52Q0 96 40 96T110 52Z" fill="#3a2a22" />
        <path d="M-30 52H110" strokeWidth="4" />
        <path d="M110 56 170 40" strokeWidth="7" strokeLinecap="round" />
        <ellipse cx="30" cy="48" rx="46" ry="7" fill="#e8731a" stroke="none" />
        <circle cx="10" cy="44" r="6" fill="#e8731a" stroke="none" />
        <circle cx="34" cy="42" r="6" fill="#e8731a" stroke="none" />
        <circle cx="58" cy="45" r="6" fill="#e8731a" stroke="none" />
      </g>
      {/* noodle bowl and chopsticks */}
      <g transform="translate(560 66)" stroke="#4a1e0a" strokeWidth="3" strokeLinejoin="round">
        <path d="M0 10h88q-4 38-44 38T0 10Z" fill="#fff0d8" />
        <path d="M6 22h76" stroke="#a82a14" strokeWidth="5" />
        <path d="M10 10q34-14 68 0" fill="#f6b93b" />
        <path d="M60-24 92 8M72-28 100 2" strokeLinecap="round" strokeWidth="4" />
      </g>
      {/* cleaver */}
      <g transform="translate(330 76)" stroke="#4a1e0a" strokeWidth="3" strokeLinejoin="round">
        <path d="M0 6h74l8 8v22H0Z" fill="#d9d4cc" />
        <path d="M-40 18h40v8h-40Z" fill="#7a4a2a" />
        <circle cx="64" cy="14" r="3" fill="#fff8ed" />
      </g>
    </svg>
  );
}

function Wisp() {
  return (
    <svg viewBox="0 0 90 220" aria-hidden="true" focusable="false">
      <path
        d="M45 215c-28-26 24-44-4-70s20-42-6-70 14-40 6-70"
        fill="none"
        stroke="#fff8ed"
        strokeWidth="14"
        strokeLinecap="round"
        opacity=".65"
      />
    </svg>
  );
}

export function OrangeChickenScene() {
  return (
    <div className="orange-chicken-scene" aria-hidden="true">
      <div className="oc-lanterns">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className="oc-lantern">
            <Lantern />
          </span>
        ))}
      </div>
      <div className="oc-scene-low">
        <div className="oc-counter">
          <Counter />
        </div>
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className="oc-steam">
            <Wisp />
          </span>
        ))}
      </div>
    </div>
  );
}
