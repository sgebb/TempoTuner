/**
 * TempoTuner tuning-fork mark — playful stroke style, tilted 7° with
 * vibration arcs. Drawn in a 64×64 space; the same geometry is duplicated
 * in public/favicon.svg, public/icon-tile.svg and shareImage.ts drawLogo,
 * so keep them in sync when tweaking.
 */
export const FORK_STROKE_PATHS = [
  'M23 12 v13 a9 9 0 0 0 18 0 V12', // prongs
  'M32 34 v12', // stem
  'M15 14 q-4.5 7 0 14', // left vibration arc
  'M49 14 q4.5 7 0 14', // right vibration arc
];
export const FORK_BALL = { cx: 32, cy: 50, r: 3.4 };
export const FORK_TILT_DEG = -7;
export const FORK_STROKE_WIDTH = 4.5;

export const TuningForkMark = ({ size = 22 }: { size?: number }) => (
  <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
    <g
      transform={`rotate(${FORK_TILT_DEG} 32 32)`}
      stroke="currentColor"
      strokeWidth={FORK_STROKE_WIDTH}
      strokeLinecap="round"
      fill="none"
    >
      {FORK_STROKE_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
      <circle cx={FORK_BALL.cx} cy={FORK_BALL.cy} r={FORK_BALL.r} fill="currentColor" stroke="none" />
    </g>
  </svg>
);

/** Standard "share" mark: three connected nodes. */
export const ShareNodes = ({ size = 17 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <path d="M8.6 10.8 L15.4 6.8 M8.6 13.2 L15.4 17.2" stroke="currentColor" strokeWidth="2" />
    <circle cx="18" cy="5.5" r="2.7" fill="currentColor" />
    <circle cx="6" cy="12" r="2.7" fill="currentColor" />
    <circle cx="18" cy="18.5" r="2.7" fill="currentColor" />
  </svg>
);

/** Reset: circular arrow. All strokes (no filled arrowhead) so it stays crisp
 *  at any size — the old filled-triangle head rendered fuzzy. */
export const ResetArrow = ({ size = 18 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="21.5 3.5 21.5 9.5 15.5 9.5" />
    <path d="M20.2 14.5 a8.5 8.5 0 1 1 -1.9 -8.8 L21.5 9" />
  </svg>
);

/** Monochrome bullseye: two rings and a filled centre. */
export const Bullseye = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="12" r="5.4" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="12" r="1.9" fill="currentColor" />
  </svg>
);
