// Daily tempo challenge: one well-known song per day, picked deterministically
// from the local date. The user taps the song's beat from memory and is scored
// on how close their tempo was to the real BPM. Results live in localStorage.

import { TapPoint } from './tempo';

export type Song = { title: string; artist: string; bpm: number };

// BPMs verified against Tunebat/SongBPM/GetSongBPM et al. (2026-07-22). Songs
// with a genuine half/double-time feel (Hey Ya!, Wonderwall, Umbrella,
// Hotel California, Footloose…) store the felt clap-along tempo — the
// octave-aware scoring below accepts either feel, so the choice only affects
// the "actual BPM" shown on reveal. Never reorder or remove entries: a song's
// index decides which day it appears, so edits in place or appends only.

export const SONGS: Song[] = [
  { title: 'Toxic', artist: 'Britney Spears', bpm: 143 },
  { title: 'Billie Jean', artist: 'Michael Jackson', bpm: 117 },
  { title: 'Dancing Queen', artist: 'ABBA', bpm: 101 },
  { title: "Stayin' Alive", artist: 'Bee Gees', bpm: 104 },
  { title: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars', bpm: 115 },
  { title: 'Shape of You', artist: 'Ed Sheeran', bpm: 96 },
  { title: 'Rolling in the Deep', artist: 'Adele', bpm: 105 },
  { title: 'Hey Ya!', artist: 'OutKast', bpm: 158 },
  { title: 'Beat It', artist: 'Michael Jackson', bpm: 139 },
  { title: 'Smells Like Teen Spirit', artist: 'Nirvana', bpm: 117 },
  { title: 'Take On Me', artist: 'a-ha', bpm: 169 },
  { title: 'Wonderwall', artist: 'Oasis', bpm: 87 },
  { title: 'I Want It That Way', artist: 'Backstreet Boys', bpm: 99 },
  { title: 'Poker Face', artist: 'Lady Gaga', bpm: 119 },
  { title: 'Bad Guy', artist: 'Billie Eilish', bpm: 135 },
  { title: 'Blinding Lights', artist: 'The Weeknd', bpm: 171 },
  { title: 'Happy', artist: 'Pharrell Williams', bpm: 160 },
  { title: 'Shake It Off', artist: 'Taylor Swift', bpm: 160 },
  { title: "Can't Stop the Feeling!", artist: 'Justin Timberlake', bpm: 113 },
  { title: 'Seven Nation Army', artist: 'The White Stripes', bpm: 124 },
  { title: 'Superstition', artist: 'Stevie Wonder', bpm: 100 },
  { title: 'I Will Survive', artist: 'Gloria Gaynor', bpm: 117 },
  { title: 'Like a Prayer', artist: 'Madonna', bpm: 111 },
  { title: "Livin' on a Prayer", artist: 'Bon Jovi', bpm: 123 },
  { title: "Don't Stop Believin'", artist: 'Journey', bpm: 119 },
  { title: "Hips Don't Lie", artist: 'Shakira', bpm: 100 },
  { title: 'Get Lucky', artist: 'Daft Punk', bpm: 116 },
  { title: 'Firework', artist: 'Katy Perry', bpm: 124 },
  { title: 'Viva la Vida', artist: 'Coldplay', bpm: 138 },
  { title: 'Crazy in Love', artist: 'Beyoncé', bpm: 99 },
  { title: 'We Will Rock You', artist: 'Queen', bpm: 81 },
  { title: 'Africa', artist: 'Toto', bpm: 92 },
  { title: 'Mr. Brightside', artist: 'The Killers', bpm: 148 },
  { title: 'Gangnam Style', artist: 'PSY', bpm: 132 },
  { title: 'Sweet Caroline', artist: 'Neil Diamond', bpm: 127 },
  { title: '...Baby One More Time', artist: 'Britney Spears', bpm: 93 },
  { title: 'My Girl', artist: 'The Temptations', bpm: 105 },
  { title: "U Can't Touch This", artist: 'MC Hammer', bpm: 133 },
  { title: 'Respect', artist: 'Aretha Franklin', bpm: 115 },
  { title: 'Ice Ice Baby', artist: 'Vanilla Ice', bpm: 116 },
  { title: 'Twist and Shout', artist: 'The Beatles', bpm: 124 },
  { title: 'What Is Love', artist: 'Haddaway', bpm: 124 },
  { title: 'Brown Eyed Girl', artist: 'Van Morrison', bpm: 150 },
  { title: 'Macarena', artist: 'Los del Río', bpm: 103 },
  { title: 'I Heard It Through the Grapevine', artist: 'Marvin Gaye', bpm: 117 },
  { title: 'Wannabe', artist: 'Spice Girls', bpm: 110 },
  { title: "(I Can't Get No) Satisfaction", artist: 'The Rolling Stones', bpm: 136 },
  { title: 'Barbie Girl', artist: 'Aqua', bpm: 130 },
  { title: 'Hey Jude', artist: 'The Beatles', bpm: 74 },
  { title: 'Believe', artist: 'Cher', bpm: 133 },
  { title: 'Jolene', artist: 'Dolly Parton', bpm: 111 },
  { title: 'Blue (Da Ba Dee)', artist: 'Eiffel 65', bpm: 128 },
  { title: 'Mamma Mia', artist: 'ABBA', bpm: 137 },
  { title: 'No Scrubs', artist: 'TLC', bpm: 93 },
  { title: 'Night Fever', artist: 'Bee Gees', bpm: 109 },
  { title: "It's My Life", artist: 'Bon Jovi', bpm: 120 },
  { title: 'Y.M.C.A.', artist: 'Village People', bpm: 127 },
  { title: 'Lose Yourself', artist: 'Eminem', bpm: 86 },
  { title: 'September', artist: 'Earth, Wind & Fire', bpm: 126 },
  { title: 'In da Club', artist: '50 Cent', bpm: 90 },
  { title: 'Hotel California', artist: 'Eagles', bpm: 74 },
  { title: 'Yeah!', artist: 'Usher ft. Lil Jon & Ludacris', bpm: 105 },
  { title: 'Sweet Home Alabama', artist: 'Lynyrd Skynyrd', bpm: 98 },
  { title: 'Since U Been Gone', artist: 'Kelly Clarkson', bpm: 131 },
  { title: 'Crocodile Rock', artist: 'Elton John', bpm: 150 },
  { title: 'SexyBack', artist: 'Justin Timberlake', bpm: 117 },
  { title: 'Thriller', artist: 'Michael Jackson', bpm: 118 },
  { title: 'Umbrella', artist: 'Rihanna ft. Jay-Z', bpm: 87 },
  { title: 'Girls Just Want to Have Fun', artist: 'Cyndi Lauper', bpm: 120 },
  { title: 'Single Ladies (Put a Ring on It)', artist: 'Beyoncé', bpm: 97 },
  { title: 'Like a Virgin', artist: 'Madonna', bpm: 120 },
  { title: 'I Gotta Feeling', artist: 'The Black Eyed Peas', bpm: 128 },
  { title: 'Sweet Dreams (Are Made of This)', artist: 'Eurythmics', bpm: 126 },
  { title: 'Party in the U.S.A.', artist: 'Miley Cyrus', bpm: 96 },
  { title: 'Every Breath You Take', artist: 'The Police', bpm: 117 },
  { title: 'Call Me Maybe', artist: 'Carly Rae Jepsen', bpm: 120 },
  { title: 'Eye of the Tiger', artist: 'Survivor', bpm: 109 },
  { title: 'Counting Stars', artist: 'OneRepublic', bpm: 122 },
  { title: 'I Wanna Dance with Somebody', artist: 'Whitney Houston', bpm: 119 },
  { title: 'All About That Bass', artist: 'Meghan Trainor', bpm: 134 },
  { title: 'Footloose', artist: 'Kenny Loggins', bpm: 174 },
  { title: 'Despacito', artist: 'Luis Fonsi ft. Daddy Yankee', bpm: 89 },
  { title: 'Wake Me Up Before You Go-Go', artist: 'Wham!', bpm: 81 },
  { title: 'Havana', artist: 'Camila Cabello', bpm: 105 },
  { title: 'Never Gonna Give You Up', artist: 'Rick Astley', bpm: 113 },
  { title: 'Watermelon Sugar', artist: 'Harry Styles', bpm: 95 },
  { title: 'Walking on Sunshine', artist: 'Katrina & The Waves', bpm: 110 },
  { title: "Don't Start Now", artist: 'Dua Lipa', bpm: 124 },
  { title: 'Another One Bites the Dust', artist: 'Queen', bpm: 110 },
  { title: 'Levitating', artist: 'Dua Lipa', bpm: 103 },
  { title: "Don't Stop Me Now", artist: 'Queen', bpm: 156 },
  { title: 'Espresso', artist: 'Sabrina Carpenter', bpm: 104 },
];

export const PRACTICE_SONG: Song = { title: 'Twinkle Twinkle Little Star', artist: 'traditional', bpm: 90 };

/** Valid intervals needed to finish a challenge run. */
export const CHALLENGE_POINTS = 16;

// ---------- day math (all in local time, like Wordle) ----------

const LAUNCH_DATE_KEY = '2026-07-22'; // daily #1

export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Noon, so DST shifts can never push day arithmetic across a midnight. */
function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function dailyNumber(dateKey: string): number {
  return Math.round((keyToDate(dateKey).getTime() - keyToDate(LAUNCH_DATE_KEY).getTime()) / 86400000) + 1;
}

export function songForDay(day: number): Song {
  const i = (((day - 1) % SONGS.length) + SONGS.length) % SONGS.length;
  return SONGS[i];
}

export function shiftDateKey(key: string, days: number): string {
  const d = keyToDate(key);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

// ---------- scoring ----------

export type Octave = 'straight' | 'half' | 'double';

/**
 * Octave-aware accuracy score. Tapping half or double time is a musically
 * valid feel, so the guess is scored against whichever of target, target×2 or
 * target÷2 it lands closest to (relative error), then mapped so that ~2% off
 * is still an excellent score and 25%+ off is 0.
 */
export function scoreGuess(guess: number, target: number): { score: number; octave: Octave } {
  const candidates: { bpm: number; octave: Octave }[] = [
    { bpm: target, octave: 'straight' },
    { bpm: target / 2, octave: 'half' },
    { bpm: target * 2, octave: 'double' },
  ];
  let best = candidates[0];
  let bestErr = Math.abs(guess - best.bpm) / best.bpm;
  for (const c of candidates.slice(1)) {
    const err = Math.abs(guess - c.bpm) / c.bpm;
    if (err < bestErr) {
      best = c;
      bestErr = err;
    }
  }
  return { score: Math.max(0, Math.round(100 - bestErr * 400)), octave: best.octave };
}

/** The run's single BPM guess: median over every interval (robust to stumbles). */
export function guessFromPoints(points: TapPoint[]): number {
  const bpms = points.map((p) => p.bpm).sort((a, b) => a - b);
  const mid = Math.floor(bpms.length / 2);
  const median = bpms.length % 2 ? bpms[mid] : (bpms[mid - 1] + bpms[mid]) / 2;
  return Math.round(median);
}

// ---------- persistence ----------

export type DailyResult = {
  day: number;
  guess: number | null;
  score: number | null;
  skipped?: boolean;
};

export type DailyResults = Record<string, DailyResult>;

const STORAGE_KEY = 'tt-daily';

export function loadDailyResults(): DailyResults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.results && typeof parsed.results === 'object') {
      return parsed.results as DailyResults;
    }
  } catch {
    // corrupted storage — start fresh
  }
  return {};
}

export function saveDailyResults(results: DailyResults) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ results }));
}

/** Consecutive days played (or skipped) ending today — or yesterday, so an unplayed today doesn't read as 0. */
export function computeStreak(results: DailyResults, todayKey: string): number {
  let streak = 0;
  let key = results[todayKey] ? todayKey : shiftDateKey(todayKey, -1);
  while (results[key]) {
    streak++;
    key = shiftDateKey(key, -1);
  }
  return streak;
}
