/**
 * TempoTuner metronome mark — hand-drawn one-line style, traced from the
 * original sketch. Path data lives in a 1940×2560 y-flipped space (vector
 * trace output); keep viewBox/transform intact when reusing.
 */
export const METRONOME_BODY_PATH =
  'M892 2371 c-55 -19 -118 -71 -152 -126 -10 -16 -35 -93 -56 -170 -62 -235 -142 -541 -190 -725 -25 -96 -56 -211 -68 -255 -13 -44 -32 -114 -42 -155 -9 -41 -28 -113 -42 -160 -58 -206 -80 -305 -71 -322 11 -21 42 -24 56 -5 6 6 31 93 56 192 42 164 125 477 175 665 27 100 84 314 142 540 92 354 98 369 149 413 17 14 53 33 80 42 58 19 111 10 173 -31 60 -39 79 -87 163 -424 26 -101 51 -191 57 -198 6 -7 21 -12 32 -10 40 6 38 17 -72 428 -46 172 -50 181 -111 240 -78 76 -176 97 -279 61z';

export const METRONOME_NEEDLE_PATH =
  'M1689 2108 c-17 -32 -42 -76 -69 -120 -20 -35 -26 -38 -65 -38 -101 0 -168 -120 -114 -206 20 -34 20 -34 -29 -116 -50 -85 -294 -507 -365 -633 -51 -90 -99 -127 -197 -150 -90 -22 -131 -46 -192 -114 -141 -156 -79 -411 122 -505 43 -20 60 -21 401 -21 356 0 356 0 405 33 130 89 141 167 64 447 -37 133 -147 556 -167 640 -18 74 -32 92 -62 76 -27 -15 -27 -39 3 -143 24 -82 70 -256 86 -328 4 -19 16 -62 25 -95 60 -218 89 -337 93 -385 3 -49 0 -60 -28 -98 -20 -28 -48 -51 -76 -64 -42 -18 -64 -19 -362 -16 -310 3 -318 4 -364 27 -151 75 -191 270 -81 392 44 49 74 65 163 88 90 24 148 59 186 113 26 36 115 187 211 358 11 19 48 85 83 145 35 61 85 149 112 196 49 86 49 86 91 82 48 -5 102 24 124 67 20 39 16 113 -7 143 -11 14 -20 27 -20 30 0 3 23 44 50 91 43 71 49 89 40 106 -14 27 -46 25 -61 -2z m-82 -250 c47 -44 20 -118 -43 -118 -35 0 -74 37 -74 70 0 10 9 29 21 44 25 32 64 34 96 4z';

export const MetronomeMark = ({ size = 22 }: { size?: number }) => (
  <svg viewBox="0 0 194 256" width={(size * 194) / 256} height={size} aria-hidden="true">
    <g transform="translate(0,256) scale(0.1,-0.1)" fill="currentColor" stroke="none">
      <path d={METRONOME_BODY_PATH} />
      <path d={METRONOME_NEEDLE_PATH} />
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
