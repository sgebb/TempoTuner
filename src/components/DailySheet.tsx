import { useEffect, useState } from 'react';
import {
  DailyResults,
  Octave,
  PRACTICE_SONG,
  Song,
  computeStreak,
  scoreGuess,
  shiftDateKey,
} from '../lib/daily';

export type RunReveal = {
  song: Song;
  guess: number;
  score: number;
  octave: Octave;
  practice: boolean;
};

type Props = {
  todayKey: string;
  day: number;
  song: Song;
  results: DailyResults;
  /** a just-finished run to reveal; null → show today's stored result or the intro */
  reveal: RunReveal | null;
  onStart: (song: Song, practice: boolean) => void;
  onSkip: () => void;
  onPracticeAt: (bpm: number) => void;
  onClose: () => void;
};

const CountUp = ({ value }: { value: number }) => {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const DUR = 900;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DUR);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown}</>;
};

const octaveNote = (octave: Octave): string | null => {
  if (octave === 'half') return 'you felt it in half time — that counts!';
  if (octave === 'double') return 'you felt it in double time — that counts!';
  return null;
};

const scoreClass = (score: number) => (score >= 80 ? 'dot-good' : score >= 50 ? 'dot-warn' : 'dot-bad');

const HistoryDots = ({ results, todayKey }: { results: DailyResults; todayKey: string }) => (
  <div className="history-dots" aria-label="Last 7 days">
    {Array.from({ length: 7 }, (_, i) => {
      const key = shiftDateKey(todayKey, i - 6);
      const r = results[key];
      const cls = !r ? 'dot-empty' : r.skipped ? 'dot-skip' : scoreClass(r.score ?? 0);
      return <span key={key} className={`history-dot ${cls}`} title={key} />;
    })}
  </div>
);

const DailySheet = ({ todayKey, day, song, results, reveal, onStart, onSkip, onPracticeAt, onClose }: Props) => {
  const [copied, setCopied] = useState(false);
  const stored = results[todayKey];
  const streak = computeStreak(results, todayKey);

  // A finished run takes priority; otherwise a stored score is re-shown as a reveal.
  const shown: RunReveal | null =
    reveal ??
    (stored && !stored.skipped && stored.guess !== null && stored.score !== null
      ? { song, guess: stored.guess, score: stored.score, octave: scoreGuess(stored.guess, song.bpm).octave, practice: false }
      : null);

  const share = async () => {
    const text = `TempoTuner Daily #${day} · ${song.title} — ${song.artist} · 🎯 ${shown!.score}/100 · 🔥${streak}\nhttps://tempotuner.app`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
      }
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="overlay" onClick={onClose} data-no-tap>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>🎵 Daily #{day}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="daily-song">
          <strong>{(shown?.song ?? song).title}</strong>
          <span className="daily-artist">{(shown?.song ?? song).artist}</span>
        </div>

        {shown ? (
          <>
            {shown.practice && <p className="sheet-hint">practice run — doesn't count</p>}
            <div className="reveal-row">
              <div className="reveal-cell">
                <div className="reveal-num">
                  <CountUp value={shown.guess} />
                </div>
                <div className="reveal-cap">you</div>
              </div>
              <div className="reveal-cell reveal-actual">
                <div className="reveal-num">{shown.song.bpm}</div>
                <div className="reveal-cap">actual</div>
              </div>
            </div>
            <div className="reveal-score">
              🎯 <strong>{shown.score}</strong>/100
              {octaveNote(shown.octave) && <span className="octave-note">{octaveNote(shown.octave)}</span>}
            </div>
            {!shown.practice && (
              <div className="daily-streak-row">
                <span>🔥 {streak} day streak</span>
                <HistoryDots results={results} todayKey={todayKey} />
              </div>
            )}
            <div className="sheet-actions">
              {stored ? (
                <button className="btn btn-ghost" onClick={() => onStart(song, true)}>
                  Play again
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => onStart(song, false)}>
                  Start Daily #{day}
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => onPracticeAt(shown.song.bpm)}>
                Practice at {shown.song.bpm}
              </button>
              {!shown.practice && (
                <button className="btn btn-primary" onClick={share}>
                  {copied ? 'Copied!' : 'Share'}
                </button>
              )}
            </div>
          </>
        ) : stored?.skipped ? (
          <>
            <p className="sheet-hint">
              You skipped today's song — streak safe. 🔥 {streak} day streak
            </p>
            <HistoryDots results={results} todayKey={todayKey} />
            <div className="sheet-actions">
              <button className="btn btn-primary" onClick={() => onStart(song, true)}>
                Play anyway (practice)
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="sheet-hint">
              Sing it in your head and tap the beat — 16 taps, no live numbers. Your first run is
              your score of record, so warm up first if you like.
            </p>
            <div className="sheet-actions">
              <button className="btn btn-ghost" onClick={onSkip}>
                Don't know it? Skip
              </button>
              <button className="btn btn-ghost" onClick={() => onStart(PRACTICE_SONG, true)}>
                Practice first
              </button>
              <button className="btn btn-primary" onClick={() => onStart(song, false)}>
                Start
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DailySheet;
