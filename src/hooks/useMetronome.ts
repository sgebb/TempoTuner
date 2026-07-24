import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureAudiblePlayback } from '../lib/audio';

/** Plain metronome: clicks at the given tempo until stopped. */
const LOOKAHEAD_S = 0.12;
const SCHEDULER_MS = 30;

export function useMetronome() {
  const [isOn, setIsOn] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const nextBeatRef = useRef(0);

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
      ensureAudiblePlayback();
      if (!ctxRef.current || ctxRef.current.state === 'closed') ctxRef.current = new Ctx();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);

      const interval = 60 / bpm;
      nextBeatRef.current = ctx.currentTime + 0.05;
      setIsOn(true);

      const scheduleClick = (time: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 1000;
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.6, time + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + 0.08);
      };

      timerRef.current = window.setInterval(() => {
        while (nextBeatRef.current < ctx.currentTime + LOOKAHEAD_S) {
          scheduleClick(nextBeatRef.current);
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
