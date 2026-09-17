/**
 * The thing that lunges at you. Hand-drawn SVG so the scare ships with no
 * image asset: a gaunt, off-white face with hollowed sockets, pinpoint red
 * pupils, and a grin that is far too wide. Rendered three times by the overlay
 * (base + two tinted glitch ghosts), so it takes an optional className only.
 */
export function JumpscareFace({
  className,
  'data-tint': tint,
}: {
  className?: string;
  'data-tint'?: 'red' | 'cyan';
}) {
  const suffix = tint ? `-${tint}` : '';
  const gradientId = `jumpscare-skin${suffix}`;
  const glowId = `jumpscare-glow${suffix}`;
  return (
    <svg
      className={className}
      data-tint={tint}
      viewBox="0 0 400 480"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="38%" r="68%">
          <stop offset="0%" stopColor="#ece4d6" />
          <stop offset="55%" stopColor="#c9bfae" />
          <stop offset="100%" stopColor="#5a4f46" />
        </radialGradient>
        <filter id={glowId} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* Skull-like head, slightly asymmetric on purpose. */}
      <path
        d="M200 18 C 96 18, 46 96, 50 196 C 53 276, 82 336, 118 386 C 146 426, 168 462, 200 466 C 236 462, 258 424, 286 384 C 322 334, 352 272, 352 194 C 354 96, 304 18, 200 18 Z"
        fill={`url(#${gradientId})`}
      />

      {/* Cracks */}
      <g stroke="#2a221d" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.85">
        <path d="M118 72 L 138 104 L 128 128 L 146 150" />
        <path d="M296 60 L 280 98 L 292 118" />
        <path d="M84 250 L 112 262 L 104 290" />
        <path d="M322 236 L 300 258 L 312 284 L 296 300" />
      </g>

      {/* Eye sockets */}
      <ellipse cx="136" cy="186" rx="52" ry="58" fill="#050505" />
      <ellipse cx="266" cy="176" rx="58" ry="66" fill="#050505" />

      {/* Red pupils */}
      <g className="jumpscare-eye-glow">
        <circle cx="138" cy="190" r="16" fill="#ff1010" filter={`url(#${glowId})`} />
        <circle cx="268" cy="182" r="19" fill="#ff1010" filter={`url(#${glowId})`} />
      </g>
      <circle cx="138" cy="190" r="6" fill="#ff5c5c" />
      <circle cx="268" cy="182" r="7" fill="#ff5c5c" />

      {/* Nose slits */}
      <path d="M190 262 L 182 296 L 194 302 Z" fill="#0a0806" />
      <path d="M212 262 L 220 296 L 208 302 Z" fill="#0a0806" />

      {/* Grin — mouth cavity */}
      <path
        d="M78 322 C 120 300, 280 300, 328 322 C 312 392, 262 428, 200 434 C 138 428, 92 392, 78 322 Z"
        fill="#050303"
      />

      {/* Upper teeth */}
      <g fill="#efe7d8">
        <polygon points="92,326 110,322 108,352" />
        <polygon points="114,320 134,316 130,366" />
        <polygon points="140,315 160,313 156,378" />
        <polygon points="166,312 186,311 182,388" />
        <polygon points="192,311 212,311 206,392" />
        <polygon points="218,311 238,312 232,386" />
        <polygon points="244,313 264,316 258,376" />
        <polygon points="270,317 290,321 284,362" />
        <polygon points="296,323 312,328 306,350" />
      </g>

      {/* Lower teeth */}
      <g fill="#d8cfbe">
        <polygon points="118,404 134,412 138,372" />
        <polygon points="146,414 166,422 168,378" />
        <polygon points="176,424 196,428 198,384" />
        <polygon points="204,428 224,424 222,384" />
        <polygon points="232,422 252,414 248,378" />
        <polygon points="260,412 278,402 272,372" />
      </g>

      {/* Blood at the corners */}
      <g fill="#8f0a0a">
        <path d="M84 330 C 80 356, 72 380, 84 402 C 92 386, 92 358, 84 330 Z" />
        <path d="M318 328 C 326 354, 332 376, 322 400 C 312 384, 312 356, 318 328 Z" />
      </g>
    </svg>
  );
}
