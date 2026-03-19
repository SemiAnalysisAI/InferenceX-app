import React from 'react';

interface DotProps {
  cx?: number;
  cy?: number;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  r?: number;
  [key: string]: unknown;
}

const EnlargedHitAreaDot = (props: DotProps) => {
  const { cx, cy, fill, fillOpacity, stroke, strokeWidth, r = 3 } = props;

  // Recharts can pass NaN or undefined coordinates during transitions; this prevents errors.
  // Always return a <g> element to satisfy Recharts' type expectation.
  return (
    <g>
      {typeof cx === 'number' && typeof cy === 'number' && (
        <>
          {/* The larger, transparent circle for an increased hit area */}
          <circle cx={cx} cy={cy} r={10} fill="transparent" />
          {/* The original, visible dot */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </>
      )}
    </g>
  );
};

export default EnlargedHitAreaDot;
