import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Daily-challenge demo: plays Twinkle Twinkle Little Star (first two phrases)
 * as simple synth notes with a tick on every beat, so people can see and hear
 * that taps go on the steady pulse — not on every word. Held words ("star",
 * "are") keep ringing while the beat ticks on, which is exactly the lesson.
 */

export const DEMO_SONG = { title: 'Twinkle Twinkle Little Star', artist: 'traditional', bpm: 90 };

/** One entry per beat; freq null = the previous word is still being held. */
export type DemoBeat = { lyric: string; freq: number | null };

const C4 = 261.63;
const D4 = 293.66;
const E4 = 329.63;
const F4 = 349.23;
const G4 = 392.0;
const A4 = 440.0;

export const DEMO_BEATS: DemoBeat[] = [
  { lyric: 'twin', freq: C4 },
  { lyric: 'kle', freq: C4 },
  { lyric: 'twin', freq: G4 },
  { lyric: 'kle', freq: G4 },
  { lyric: 'lit', freq: A4 },
  { lyric: 'tle', freq: A4 },
  { lyric: 'star', freq: G4 },
  { lyric: 'star', freq: null },
  { lyric: 'how', freq: F4 },
  { lyric: 'I', freq: F4 },
  { lyric: 'won', freq: E4 },
  { lyric: 'der', freq: E4 },
  { lyric: 'what', freq: D4 },
  { lyric: 'you', freq: D4 },
  { lyric: 'are', freq: C4 },
  { lyric: 'are', freq: null },
];

const LEAD_IN_S = 0.6;

const scheduleTick = (ctx: AudioContext, time: number) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 1500;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.12, time + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.08);
};

const scheduleNote = (ctx: AudioContext, freq: number, time: number, duration: number) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.16, time + 0.02);
  gain.gain.setValueAtTime(0.16, time + Math.max(0.03, duration - 0.12));
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + duration + 0.02);
};

export function useDemo() {
  const [running, setRunning] = useState(false);
  /** -1 during the lead-in, then the index of the current beat. */
  const [beat, setBeat] = useState(-1);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const t0Ref = useRef(0);
  const onDoneRef = useRef<(() => void) | null>(null);

  // Closing the context also silences everything still scheduled on it.
  const teardown = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    setRunning(false);
    setBeat(-1);
  }, []);

  const stop = useCallback(() => {
    onDoneRef.current = null;
    teardown();
  }, [teardown]);

  const start = useCallback(
    (onDone?: () => void) => {
      stop();
      const Ctx =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
      onDoneRef.current = onDone ?? null;

      const interval = 60 / DEMO_SONG.bpm;
      const t0 = ctx.currentTime + LEAD_IN_S;
      t0Ref.current = t0;

      DEMO_BEATS.forEach((b, i) => {
        const t = t0 + i * interval;
        scheduleTick(ctx, t);
        if (b.freq !== null) {
          let beats = 1;
          while (i + beats < DEMO_BEATS.length && DEMO_BEATS[i + beats].freq === null) beats++;
          scheduleNote(ctx, b.freq, t, beats * interval * 0.95);
        }
      });

      setRunning(true);
      setBeat(-1);

      // setInterval (not rAF): it keeps ticking in background tabs, so the
      // demo still wraps up if the user looks away while the audio plays.
      timerRef.current = window.setInterval(() => {
        const elapsed = ctx.currentTime - t0Ref.current;
        // let the last note ring for most of its beat before wrapping up
        if (elapsed >= (DEMO_BEATS.length + 0.6) * interval) {
          const done = onDoneRef.current;
          onDoneRef.current = null;
          teardown();
          done?.();
          return;
        }
        const idx = Math.floor(elapsed / interval);
        setBeat(Math.min(Math.max(idx, -1), DEMO_BEATS.length - 1));
      }, 40);
    },
    [stop, teardown]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      ctxRef.current?.close().catch(() => undefined);
    };
  }, []);

  return { running, beat, start, stop };
}
