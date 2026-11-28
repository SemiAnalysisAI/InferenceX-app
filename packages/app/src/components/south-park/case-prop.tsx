// Little paper props, never drawings of the characters themselves. Each accident has its own silhouette.
const forms = [
  <g key="bar" fill="#da5143">
    <path d="m8 53 13-1 1 22H8zM25 39l14-1v36H25zM43 14l15-1-1 61H43z" />
    <path fill="#f4bb3b" d="m60 4 9 1-2 17-7 1z" />
  </g>,
  <path
    key="spike"
    fill="none"
    stroke="#ca3c37"
    strokeWidth="7"
    d="m1 68 17-8 10 3L42 7l5 52 12-9 16-6"
  />,
  <path key="bolt" fill="#ffd546" d="M46 3 17 45l18-2-7 31 35-49-19 5z" />,
  <g key="axis" fill="#24516c">
    <path d="M18 3h5v63h49v5H18z" />
    <path d="m10 17 10-15 11 15z" />
    <path strokeDasharray="3 3" d="M29 47h37" />
  </g>,
  <g key="bus">
    <path fill="#efb735" d="M4 32 58 30l11 13 6 1v17H3z" />
    <path fill="#b9edf3" d="M10 35h10v10H10zm14 0h10v10H24zm14 0h10v10H38zm14 0h6l8 10H52z" />
    <path fill="#242e30" d="M5 50h68v3H5z" />
    <circle cx="17" cy="61" r="7" />
    <circle cx="61" cy="61" r="7" />
  </g>,
  <path key="drift" fill="#f5ffff" d="M0 72q4-25 17-29 2-18 19-16 12-22 26-8 15 12 18 47z" />,
  <g key="saucer">
    <path fill="#fbdb54" opacity=".7" d="m31 35-17 36 51-1-16-35z" />
    <path fill="#8edaba" d="M20 29q2-24 22-23 15 1 20 24" />
    <ellipse cx="41" cy="31" rx="33" ry="10" fill="#6884aa" />
    <path stroke="#ffdf47" strokeWidth="3" strokeDasharray="5 5" d="m16 32 49-1" />
  </g>,
  <g key="tip">
    <path fill="#fff1c1" d="m4 10 70 2-2 43H48l-11 13-2-14-30 1z" />
    <path d="M15 25h43m-42 9h28" fill="none" stroke="#586d5b" strokeWidth="4" />
  </g>,
  <g key="legend" fill="#f2e7bf">
    <path d="m2 30 75-10-5 30L5 59z" />
    <path stroke="#b83c3c" strokeWidth="6" d="m14 39 16-2" />
    <path stroke="#24745c" strokeWidth="6" d="m40 35 18-2" />
  </g>,
  <g key="scatter">
    <path d="m0 9 38 22M2 22l29 14" stroke="#83adaf" strokeWidth="4" />
    <circle cx="52" cy="46" r="18" fill="#e26235" />
    <path d="m46 39 5-3" stroke="#fff0bb" strokeWidth="4" />
  </g>,
  <circle
    key="spinner"
    cx="40"
    cy="40"
    r="26"
    fill="none"
    stroke="#286e5c"
    strokeWidth="13"
    strokeDasharray="122 41"
  />,
  <g key="oom">
    <path fill="#347864" d="M13 16h51v47H13z" />
    <path fill="#f9eab9" d="M21 24h34v30H21z" />
    <path d="M20 6v9m10-9v9m12-9v9m11-9v9M20 65v9m10-9v9m12-9v9m11-9v9" strokeWidth="4" />
    <path fill="#d34b38" d="M36 29h6l-1 13h-5zm0 16h6v6h-6z" />
  </g>,
];
export function CaseProp({ id }: { id: number }) {
  return (
    <svg
      className={`sp-prop sp-prop-${id}`}
      viewBox="0 0 80 80"
      fill="#242e30"
      stroke="#2b3631"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {forms[id]}
    </svg>
  );
}
