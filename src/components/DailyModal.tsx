import { useEffect, useRef, useState } from 'react';
import {
  DailyResults,
  Octave,
  computeStreak,
  dailyNumber,
  localDateKey,
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
  /** a made-up past day — saved locally as `late`, never on the leaderboard */
  archive?: boolean;
  /** the played day's number/key when it isn't today (archive runs) */
  dayNum?: number;
  dayKey?: string;
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
  /** play a missed (closed) day from the calendar — throws Error('open') if the
   *  day can still be scored somewhere on Earth */
  onStartArchive: (dayKey: string) => Promise<void>;
  /** "Try again": the same blind run, score not submitted */
  onStartPractice: (title: string, artist: string, bpm: number) => void;
  onDemo: () => void;
  onLeaderboard: () => void;
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

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * The archive calendar: one cell per date. Grey = not out (pre-launch or
 * future), green = played on the day, yellow = made up later, red = missed
 * and playable. Red cells (and an unplayed today) start a run via onPick.
 */
const ArchiveCalendar = ({
  results,
  todayKey,
  busyKey,
  onPick,
}: {
  results: DailyResults;
  todayKey: string;
  busyKey: string | null;
  onPick: (dayKey: string) => void;
}) => {
  const [month, setMonth] = useState(todayKey.slice(0, 7)); // 'YYYY-MM'
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday-first
  // navigable range: the launch month through the current month
  const canPrev = dailyNumber(localDateKey(new Date(y, m - 1, 0))) >= 1;
  const canNext = localDateKey(new Date(y, m, 1)) <= todayKey;
  const shiftMonth = (by: number) => {
    const d = new Date(y, m - 1 + by, 1);
    setMonth(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  };
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <div className="cal-head">
        <button className="icon-btn" onClick={() => shiftMonth(-1)} disabled={!canPrev} aria-label="Previous month">
          ‹
        </button>
        <span className="cal-month">{monthLabel}</span>
        <button className="icon-btn" onClick={() => shiftMonth(1)} disabled={!canNext} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="cal-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={`wd${i}`} className="cal-wd" aria-hidden="true">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead${i}`} className="cal-cell cal-blank" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const key = `${y}-${pad2(m)}-${pad2(i + 1)}`;
          const num = dailyNumber(key);
          const released = num >= 1 && key <= todayKey;
          const r = results[key];
          const done = !!r && !r.skipped && r.score !== null;
          const cls = !released ? 'cal-off' : done ? (r.late ? 'cal-late' : 'cal-done') : 'cal-missed';
          const playable = released && !done;
          return (
            <button
              key={key}
              className={`cal-cell ${cls}${key === todayKey ? ' cal-today' : ''}${key === busyKey ? ' cal-busy' : ''}`}
              disabled={!playable || busyKey !== null}
              onClick={() => onPick(key)}
              title={released ? `Daily #${num}` : undefined}
              aria-label={released ? `Daily #${num}, ${key}` : key}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="cal-legend">
        <span>
          <i className="cal-dot cal-done" /> played
        </span>
        <span>
          <i className="cal-dot cal-late" /> made up
        </span>
        <span>
          <i className="cal-dot cal-missed" /> missed
        </span>
        <span>
          <i className="cal-dot cal-off" /> not out
        </span>
      </div>
    </>
  );
};

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
  onStartArchive,
  onStartPractice,
  onDemo,
  onLeaderboard,
  onClose,
}: Props) => {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState(false);
  // the archive calendar swaps in for the modal body
  const [calOpen, setCalOpen] = useState(false);
  const [calBusy, setCalBusy] = useState<string | null>(null);
  const [calError, setCalError] = useState<string | null>(null);
  // Preview info is fetched lazily on the first "listen" tap — a reveal
  // re-shown from storage never called fetchDaily.
  const [preview, setPreview] = useState<{ url: string | null; trackUrl: string | null } | null>(
    null
  );
  // The song plays only inside this modal; the ref mirrors the state so the
  // unmount cleanup can stop a clip that's still going.
  const [previewPlaying, setPreviewPlaying] = useState(false);
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
      // an archive reveal listens to its own day's song, not today's
      const info = await fetchDaily(shown?.dayKey ?? todayKey);
      p = { url: info.previewUrl, trackUrl: info.trackUrl };
    } catch {
      p = { url: null, trackUrl: null };
    }
    setPreview(p);
    return p;
  };

  const toggleListen = async () => {
    if (previewPlaying) {
      stopPreview();
      return;
    }
    const p = await loadPreview();
    if (!p.url) return; // the button re-renders as "preview unavailable"
    playingRef.current = true;
    setPreviewPlaying(true);
    playPreview(p.url, {
      onDone: () => {
        playingRef.current = false;
        setPreviewPlaying(false);
      },
    });
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
          rankToday: stored.rankToday,
          playersToday: stored.playersToday,
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

  // A calendar cell was tapped: today runs the real daily, a closed past
  // day runs an archive replay (on success either way this sheet unmounts).
  const pickDay = async (dayKey: string) => {
    setCalError(null);
    if (dayKey === todayKey) {
      setCalOpen(false);
      await start();
      return;
    }
    setCalBusy(dayKey);
    try {
      await onStartArchive(dayKey);
    } catch (err) {
      setCalError(
        err instanceof Error && err.message === 'open'
          ? "that day is still being played around the world — come back tomorrow"
          : "couldn't fetch that day — are you online?"
      );
      setCalBusy(null);
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
        // no share sheet and no clipboard — image downloaded, text to clipboard
        await navigator.clipboard.writeText(text).catch(() => undefined);
      }
      if (outcome !== 'shared') {
        // desktop: the card is on the clipboard — say so
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
          <h2>🎵 {calOpen ? 'Past dailies' : `Daily #${shown?.dayNum ?? day}`}</h2>
          <span className="sheet-header-btns">
            {!scoring && !runError && (
              <button
                className={`icon-btn${calOpen ? ' cal-toggle-on' : ''}`}
                onClick={() => {
                  setCalOpen((o) => !o);
                  setCalError(null);
                }}
                title="Play a day you missed"
                aria-label="Past dailies calendar"
              >
                📅
              </button>
            )}
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </span>
        </div>

        {calOpen ? (
          <>
            <ArchiveCalendar results={results} todayKey={todayKey} busyKey={calBusy} onPick={pickDay} />
            {calError && <p className="sheet-hint start-error">{calError}</p>}
            <p className="sheet-hint sheet-fineprint">
              tap a missed day to play it now — made-up runs are saved on your device only, not the
              leaderboard
            </p>
          </>
        ) : scoring ? (
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
            {shown.archive && (
              <p className="sheet-hint">made-up day — saved on your device, not the leaderboard</p>
            )}
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
            {!shown.practice && !shown.archive && (
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
                  Try again
                </button>
              )}
              <button className="btn btn-ghost" onClick={onLeaderboard}>
                🏆 Leaderboard
              </button>
              {!shown.practice && !shown.archive && (
                <button className="btn btn-primary" onClick={share} disabled={busy}>
                  {busy ? 'Creating…' : copied ? 'Copied!' : 'Share'}
                </button>
              )}
            </div>
            {/* on its own line so toggling to "stop" never reflows the buttons */}
            {apiConfigured() && (
              <p className="sheet-hint preview-line">
                <button
                  className="linklike"
                  onClick={toggleListen}
                  disabled={preview !== null && !preview.url}
                >
                  {previewPlaying
                    ? '◼ stop'
                    : preview && !preview.url
                      ? 'preview unavailable'
                      : '🔊 listen to the original'}
                </button>
                {previewPlaying && preview?.trackUrl && (
                  <>
                    {' · '}
                    <a className="linklike" href={preview.trackUrl} target="_blank" rel="noreferrer">
                      from Apple Music ↗
                    </a>
                  </>
                )}
              </p>
            )}
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
