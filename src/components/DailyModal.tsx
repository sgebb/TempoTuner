import { useEffect, useRef, useState } from 'react';
import {
  DailyResults,
  Octave,
  computeStreak,
  scoreGuess,
  shiftDateKey,
  wobblePenalty,
} from '../lib/daily';
import { renderDailyShareImage, shareOrDownload } from '../lib/shareImage';
import { apiConfigured, fetchDaily, getNickname } from '../lib/leaderboard';
import { playPreview, stopPreview } from '../lib/preview';

export type RunReveal = {
  title: string;
  artist: string;
  /** the song's real BPM — null only for legacy results stored before the server owned it */
  actual: number | null;
  guess: number;
  score: number;
  octave: Octave | null;
  /** consistency points deducted from the accuracy score (0 = steady run) */
  wobble: number;
  practice: boolean;
  rankToday?: number;
  playersToday?: number;
};

type Props = {
  todayKey: string;
  day: number;
  dark: boolean;
  results: DailyResults;
  /** a just-finished run to reveal; null → show today's stored result or the intro */
  reveal: RunReveal | null;
  /** a finished run is at the server being scored */
  scoring: boolean;
  /** the server couldn't be reached to score the finished run */
  runError: boolean;
  onRetryRun: () => void;
  onStartDaily: () => Promise<void>;
  onStartPractice: (title: string, artist: string, bpm: number) => void;
  onDemo: () => void;
  onLeaderboard: () => void;
  /** free tapping at the song's BPM — with the real clip playing along if available */
  onPracticeAt: (bpm: number, previewUrl: string | null) => void;
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

const octaveNote = (octave: Octave | null): string | null => {
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

const DailyModal = ({
  todayKey,
  day,
  dark,
  results,
  reveal,
  scoring,
  runError,
  onRetryRun,
  onStartDaily,
  onStartPractice,
  onDemo,
  onLeaderboard,
  onPracticeAt,
  onClose,
}: Props) => {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState(false);
  // Preview info is fetched lazily on the first "hear the real thing" tap —
  // a reveal re-shown from storage never called fetchDaily.
  const [preview, setPreview] = useState<{ url: string | null; trackUrl: string | null } | null>(
    null
  );
  const [previewPlaying, setPreviewPlaying] = useState(false);
  // Mirrors previewPlaying for the unmount cleanup: only stop playback THIS
  // sheet started — never the tap-along song onPracticeAt just handed off.
  const playingRef = useRef(false);
  const stored = results[todayKey];
  const streak = computeStreak(results, todayKey);

  useEffect(
    () => () => {
      if (playingRef.current) stopPreview();
    },
    []
  );

  const loadPreview = async () => {
    if (preview) return preview;
    let p: { url: string | null; trackUrl: string | null };
    try {
      const info = await fetchDaily(todayKey);
      p = { url: info.previewUrl, trackUrl: info.trackUrl };
    } catch {
      p = { url: null, trackUrl: null };
    }
    setPreview(p);
    return p;
  };

  const hearIt = async () => {
    if (previewPlaying) {
      stopPreview();
      return;
    }
    const p = await loadPreview();
    if (!p.url) return;
    playingRef.current = true;
    setPreviewPlaying(true);
    playPreview(p.url, {
      onDone: () => {
        playingRef.current = false;
        setPreviewPlaying(false);
      },
    });
  };

  const practiceAlong = async (bpm: number) => {
    const p = apiConfigured() ? await loadPreview() : null;
    onPracticeAt(bpm, p?.url ?? null);
  };

  // A finished run takes priority; otherwise a stored score is re-shown as a reveal.
  const shown: RunReveal | null =
    reveal ??
    (stored && !stored.skipped && stored.guess !== null && stored.score !== null
      ? {
          title: stored.title ?? `Daily #${day}`,
          artist: stored.artist ?? '',
          actual: stored.actual ?? null,
          guess: stored.guess,
          score: stored.score,
          octave: stored.actual != null ? scoreGuess(stored.guess, stored.actual).octave : null,
          wobble: stored.bpms ? wobblePenalty(stored.bpms) : 0,
          practice: false,
        }
      : null);

  const start = async () => {
    setStartBusy(true);
    setStartError(false);
    try {
      await onStartDaily(); // on success this sheet unmounts
    } catch {
      setStartError(true);
      setStartBusy(false);
    }
  };

  const share = async () => {
    if (!shown || busy) return;
    setBusy(true);
    try {
      // No song name: keeps the text short and doesn't spoil the day's song
      // for whoever receives it (the image still shows it).
      const text = `TempoTuner Daily #${day} · 🎯 ${shown.score}/100 · 🔥${streak}\nhttps://tempotuner.app`;
      const blob = await renderDailyShareImage({
        day,
        title: shown.title,
        artist: shown.artist,
        actual: shown.actual,
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

  // No backdrop-click close: this modal pops open right as the 16th tap lands,
  // and the next rhythm tap would dismiss the reveal before it was ever seen.
  return (
    <div className="overlay overlay-center" data-no-tap>
      <div className="sheet">
        <div className="sheet-header">
          <h2>🎵 Daily #{day}</h2>
          <span className="sheet-header-buttons">
            <button className="chip lb-chip" onClick={onLeaderboard}>
              🏆 leaderboard
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </span>
        </div>

        {scoring ? (
          <p className="sheet-hint">🥁 scoring your run…</p>
        ) : runError ? (
          <>
            <p className="sheet-hint">
              Couldn't reach the server to score your run — your taps are safe, try again in a
              moment.
            </p>
            <div className="sheet-actions">
              <button className="btn btn-primary" onClick={onRetryRun}>
                Retry
              </button>
            </div>
          </>
        ) : shown ? (
          <>
            <div className="daily-song">
              <strong>{shown.title}</strong>
              <span className="daily-artist">{shown.artist}</span>
            </div>
            {shown.practice && <p className="sheet-hint">practice run — doesn't count</p>}
            <div className="reveal-row">
              <div className="reveal-cell">
                <div className="reveal-num">
                  <CountUp value={shown.guess} />
                </div>
                <div className="reveal-cap">you</div>
              </div>
              <div className="reveal-cell reveal-actual">
                <div className="reveal-num">{shown.actual ?? '—'}</div>
                <div className="reveal-cap">actual</div>
              </div>
            </div>
            <div className="reveal-score">
              <span>
                🎯 <strong>{shown.score}</strong>/100
              </span>
              {!shown.practice && shown.rankToday !== undefined && (
                <span className="rank-note">
                  {getNickname() ? (
                    <>
                      #{shown.rankToday} of {shown.playersToday} today —{' '}
                      <button className="linklike" onClick={onLeaderboard}>
                        see the leaderboard
                      </button>
                    </>
                  ) : (
                    <>
                      you'd be #{shown.rankToday} of {shown.playersToday} today —{' '}
                      <button className="linklike" onClick={onLeaderboard}>
                        join the leaderboard
                      </button>
                    </>
                  )}
                </span>
              )}
              {octaveNote(shown.octave) && <span className="octave-note">{octaveNote(shown.octave)}</span>}
              {shown.wobble > 0 && (
                <span className="wobble-note">
                  −{shown.wobble} for an unsteady beat — finding the tempo is half the game, holding
                  it is the rest!
                </span>
              )}
            </div>
            {apiConfigured() && (
              <p className="sheet-hint preview-line">
                <button
                  className="linklike"
                  onClick={hearIt}
                  disabled={preview !== null && !preview.url}
                >
                  {previewPlaying
                    ? '◼ stop'
                    : preview && !preview.url
                      ? 'preview unavailable'
                      : '🔊 hear the real thing'}
                </button>
                {preview?.trackUrl && (
                  <>
                    {' · '}
                    <a className="linklike" href={preview.trackUrl} target="_blank" rel="noreferrer">
                      from Apple Music ↗
                    </a>
                  </>
                )}
              </p>
            )}
            {!shown.practice && (
              <div className="daily-streak-row">
                <span>🔥 {streak} day streak</span>
                <HistoryDots results={results} todayKey={todayKey} />
              </div>
            )}
            <div className="sheet-actions">
              {shown.actual !== null && (
                <button
                  className="btn btn-ghost"
                  onClick={() => onStartPractice(shown.title, shown.artist, shown.actual!)}
                >
                  Play again
                </button>
              )}
              {shown.actual !== null && (
                <button className="btn btn-ghost" onClick={() => practiceAlong(shown.actual!)}>
                  {apiConfigured() ? '🔊 ' : ''}Practice at {shown.actual}
                </button>
              )}
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
              Sing today's song in your head and tap its beat from memory — 16 taps.
            </p>
            {startError && (
              <p className="sheet-hint start-error">
                Couldn't fetch today's song — are you online? Try again in a moment.
              </p>
            )}
            <div className="sheet-actions">
              <button className="btn btn-ghost" onClick={onDemo}>
                ▶ Show me how
              </button>
              <button className="btn btn-primary" onClick={start} disabled={startBusy}>
                {startBusy ? 'Starting…' : 'Start'}
              </button>
            </div>
            <p className="sheet-hint sheet-fineprint">
              tap the steady pulse you'd clap along to, not every word · your first full run
              counts · don't know the song? play a 🔊 clip mid-run
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default DailyModal;
