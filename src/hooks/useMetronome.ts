import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Metronome that counts you in at full volume, fades over the next beats and
 * is gone after TOTAL_BEATS clicks — regardless of tempo — so you continue on
 * your own and check yourself afterwards.
 */
const FULL_BEATS = 4;
const TOTAL_BEATS = 8;
const LOOKAHEAD_S = 0.12;
const SCHEDULER_MS = 30;

export function useMetronome() {
  const [isOn, setIsOn] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const nextBeatRef = useRef(0);
  const beatCountRef = useRef(0);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsOn(false);
  }, []);

  const start = useCallback(
    (bpm: number) => {
      stop();
      const Ctx =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!ctxRef.current || ctxRef.current.state === 'closed') ctxRef.current = new Ctx();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);

      const interval = 60 / bpm;
      nextBeatRef.current = ctx.currentTime + 0.05;
      beatCountRef.current = 0;
      setIsOn(true);

      const scheduleClick = (time: number, volume: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 1000;
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.25 * volume), time + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + 0.08);
      };

      timerRef.current = window.setInterval(() => {
        while (nextBeatRef.current < ctx.currentTime + LOOKAHEAD_S) {
          const n = beatCountRef.current;
          if (n >= TOTAL_BEATS) {
            stop();
            return;
          }
          const volume = n < FULL_BEATS ? 1 : (TOTAL_BEATS - n) / (TOTAL_BEATS - FULL_BEATS);
          scheduleClick(nextBeatRef.current, volume);
          beatCountRef.current = n + 1;
          nextBeatRef.current += interval;
        }
      }, SCHEDULER_MS);
    },
    [stop]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      ctxRef.current?.close().catch(() => undefined);
    };
  }, []);

  return { isOn, start, stop };
}
