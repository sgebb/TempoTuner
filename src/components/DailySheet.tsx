import { useEffect, useState } from 'react';
import {
  DailyResults,
  Octave,
  Song,
  computeStreak,
  scoreGuess,
  shiftDateKey,
  wobblePenalty,
} from '../lib/daily';
import { renderDailyShareImage, shareOrDownload } from '../lib/shareImage';

export type RunReveal = {
  song: Song;
  guess: number;
  score: number;
  octave: Octave;
  /** consistency points deducted from the accuracy score (0 = steady run) */
  wobble: number;
  practice: boolean;
};

type Props = {
  todayKey: string;
  day: number;
  song: Song;
  dark: boolean;
  results: DailyResults;
  /** a just-finished run to reveal; null → show today's stored result or the intro */
  reveal: RunReveal | null;
  onStart: (song: Song, practice: boolean) => void;
  onDemo: () => void;
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

const DailySheet = ({ todayKey, day, song, dark, results, reveal, onStart, onDemo, onPracticeAt, onClose }: Props) => {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const stored = results[todayKey];
  const streak = computeStreak(results, todayKey);

  // A finished run takes priority; otherwise a stored score is re-shown as a reveal.
  const shown: RunReveal | null =
    reveal ??
    (stored && !stored.skipped && stored.guess !== null && stored.score !== null
      ? {
          song,
          guess: stored.guess,
          score: stored.score,
          octave: scoreGuess(stored.guess, song.bpm).octave,
          wobble: stored.bpms ? wobblePenalty(stored.bpms) : 0,
          practice: false,
        }
      : null);

  const share = async () => {
    if (!shown || busy) return;
    setBusy(true);
    try {
      const text = `TempoTuner Daily #${day} · ${song.title} — ${song.artist} · 🎯 ${shown.score}/100 · 🔥${streak}\nhttps://tempotuner.app`;
      const blob = await renderDailyShareImage({
        day,
        song: shown.song,
        guess: shown.guess,
        score: shown.score,
        octave: shown.octave,
        streak,
        bpms: stored?.bpms ?? null,
        dark,
      });
      const outcome = await shareOrDownload(blob, text);
      if (outcome === 'downloaded') {
        // no share sheet on this device — image downloaded, text to clipboard
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay overlay-center" onClick={onClose} data-no-tap>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>🎵 Daily #{day}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {shown && (
          <div className="daily-song">
            <strong>{shown.song.title}</strong>
            <span className="daily-artist">{shown.song.artist}</span>
          </div>
        )}

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
              <span>
                🎯 <strong>{shown.score}</strong>/100
              </span>
              {octaveNote(shown.octave) && <span className="octave-note">{octaveNote(shown.octave)}</span>}
              {shown.wobble > 0 && (
                <span className="wobble-note">
                  −{shown.wobble} for an unsteady beat — finding the tempo is half the game, holding
                  it is the rest!
                </span>
              )}
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
                <button className="btn btn-primary" onClick={share} disabled={busy}>
                  {busy ? 'Creating…' : copied ? 'Copied!' : 'Share'}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="sheet-hint">
              Start to reveal today's song, then sing it in your head and tap the{' '}
              <strong>main beat</strong> — the steady pulse you'd clap along to, not every word —
              16 taps, no live numbers. Your first full run is your score of record; stopping
              mid-run doesn't count. Unsure what to tap? Watch the demo first.
            </p>
            <div className="sheet-actions">
              <button className="btn btn-ghost" onClick={onDemo}>
                ▶ Show me how
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
