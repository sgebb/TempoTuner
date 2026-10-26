import { useEffect, useRef, useState } from 'react';
import {
  DailyResults,
  Octave,
  computeStreak,
  dailyNumber,
  scoreGuess,
  shiftDateKey,
  wobblePenalty,
} from '../lib/daily';
import { renderDailyShareImage, shareOrDownload } from '../lib/shareImage';
import { apiConfigured, fetchDaily, getNickname } from '../lib/leaderboard';
import { Challenge, challengeUrl } from '../lib/challenge';
import { canPromptInstall, isInstalled, isIos, promptInstall } from '../lib/install';
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
  /** a friend's score to beat, carried in by a challenge link */
  ghost: Challenge | null;
  /** a just-finished run to reveal; null → show today's stored result or the intro */
  reveal: RunReveal | null;
  /** a finished run is at the server being scored */
  scoring: boolean;
  /** the server couldn't be reached to score the finished run */
  runError: boolean;
  onRetryRun: () => void;
  onStartDaily: () => Promise<void>;
  /** "Try again": the same blind run, score not submitted; pass the day's
   *  key/number so the reveal stays labeled as that day */
  onStartPractice: (
    title: string,
    artist: string,
    bpm: number,
    archive?: { key: string; number: number } | null
  ) => void;
  onDemo: () => void;
  onLeaderboard: () => void;
  /** open the past-dailies calendar, optionally on a given day */
  onCalendar: (dayKey?: string) => void;
  /** drop a practice/archive reveal and go back to today's card */
  onDismissReveal: () => void;
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

/**
 * The home screen's centerpiece: today's challenge before it's played, the
 * result after — and the reveal of any run that just finished (practice
 * replays and made-up days included).
 */
const DailyCard = ({
  todayKey,
  day,
  dark,
  results,
  ghost,
  reveal,
  scoring,
  runError,
  onRetryRun,
  onStartDaily,
  onStartPractice,
  onDemo,
  onLeaderboard,
  onCalendar,
  onDismissReveal,
}: Props) => {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState(false);
  // Preview info is fetched lazily on the first "listen" tap — a reveal
  // re-shown from storage never called fetchDaily.
  const [preview, setPreview] = useState<{ url: string | null; trackUrl: string | null } | null>(
    null
  );
  // The song plays only from this card; the ref mirrors the state so the
  // unmount cleanup can stop a clip that's still going.
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const playingRef = useRef(false);
  const stored = results[todayKey];
  const streak = computeStreak(results, todayKey);

  // Once a streak is worth protecting (3+ days), offer to install the app —
  // asking earlier just gets dismissed, and the habit is what makes it stick.
  const [installDismissed, setInstallDismissed] = useState(
    () => localStorage.getItem('tt-install-dismissed') === '1'
  );
  const [installBusy, setInstallBusy] = useState(false);
  const showInstallNudge =
    streak >= 3 && !installDismissed && !isInstalled() && (canPromptInstall() || isIos());

  const dismissInstall = () => {
    localStorage.setItem('tt-install-dismissed', '1');
    setInstallDismissed(true);
  };

  const install = async () => {
    setInstallBusy(true);
    const accepted = await promptInstall();
    setInstallBusy(false);
    // declined → the captured prompt is spent, so the nudge hides on its own
    // this session (canPromptInstall is false) and comes back another day
    if (accepted) dismissInstall();
  };

  useEffect(
    () => () => {
      if (playingRef.current) stopPreview();
    },
    []
  );

  const storedReveal: RunReveal | null =
    stored && !stored.skipped && stored.guess !== null && stored.score !== null
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
      : null;
  // "Try again" on today's song: the real result stays the card, and the
  // practice score is shown alongside it rather than replacing it
  const todayPractice =
    reveal?.practice && (reveal.dayKey ?? todayKey) === todayKey && storedReveal ? reveal : null;
  // A finished run takes priority; otherwise a stored score is re-shown as a reveal.
  const shown: RunReveal | null = todayPractice ? storedReveal : (reveal ?? storedReveal);
  // a replay or a made-up day — not today's real result
  const sideRun = !!shown && (shown.practice || !!shown.archive);
  const shownKey = shown?.dayKey ?? todayKey;

  // the clip belongs to whichever day is shown — reset it when that changes
  useEffect(() => {
    if (playingRef.current) stopPreview();
    setPreview(null);
  }, [shownKey]);

  const loadPreview = async () => {
    if (preview) return preview;
    let p: { url: string | null; trackUrl: string | null };
    try {
      const info = await fetchDaily(shownKey);
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

  const start = async () => {
    setStartBusy(true);
    setStartError(false);
    try {
      await onStartDaily(); // on success the run view takes over
    } catch {
      setStartError(true);
    } finally {
      setStartBusy(false);
    }
  };

  // A friend's challenge for a day other than today (links get opened late,
  // and timezones can even make the challenged day tomorrow here). Rendered
  // on both the intro and the reveal, until that day has been played.
  const ghostName = ghost?.nick ?? 'A friend';
  const ghostElsewhere =
    ghost &&
    ghost.day !== todayKey &&
    !results[ghost.day] &&
    (ghost.day > todayKey ? (
      <p className="sheet-hint ghost-banner">
        🥊 {ghostName} challenged you on Daily #{dailyNumber(ghost.day)} — that day hasn't reached
        your timezone yet, come back tomorrow!
      </p>
    ) : (
      <p className="sheet-hint ghost-banner">
        🥊 {ghostName} scored <strong>{ghost.score}/100</strong> on Daily #{dailyNumber(ghost.day)} —{' '}
        <button className="linklike" onClick={() => onCalendar(ghost.day)}>
          find it &amp; beat that
        </button>
      </p>
    ));

  const share = async () => {
    if (!shown || busy) return;
    setBusy(true);
    try {
      // The text is a dare, not a score report — "4 BPM off" makes the reader
      // want to try, where "71/100" just informs. No song name: doesn't spoil
      // the day's song for whoever receives it (the image still shows it).
      // Distance is against the octave the run was felt in, like the scoring.
      const matched =
        shown.actual === null
          ? null
          : shown.octave === 'half'
            ? shown.actual / 2
            : shown.octave === 'double'
              ? shown.actual * 2
              : shown.actual;
      const off = matched === null ? null : Math.round(Math.abs(shown.guess - matched));
      const feat =
        off === null
          ? `I tapped today's song from memory`
          : off === 0
            ? `I tapped today's song from memory and hit its exact tempo`
            : `I tapped today's song from memory and was ${off} BPM off`;
      const streakPart = streak > 1 ? ` · 🔥${streak}` : '';
      // The link carries a ghost challenge: whoever opens it sees this name
      // and score as the mark to beat. (This button only shows on today's
      // real result, so the challenged day is todayKey.)
      const nick = getNickname();
      const url = challengeUrl(
        nick ? { day: todayKey, score: shown.score, nick } : { day: todayKey, score: shown.score }
      );
      const text = `TempoTuner Daily #${day} — ${feat} 🎯 ${shown.score}/100${streakPart}\nbeat my score: ${url}`;
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

  return (
    <>
      <section className="daily-card" data-no-tap>
        <div className="sheet-header">
          <h2>
            🎵 Daily #{shown?.dayNum ?? day}
            {!sideRun && !shown && <span className="daily-new">today</span>}
          </h2>
          {!scoring && !runError && (
            <span className="cal-btn-wrap">
              {shown && !sideRun && (
                <span className="cal-callout squiggle" aria-hidden="true">
                  try older songs
                  <svg className="cal-callout-arrow" viewBox="0 0 36 24">
                    <path
                      d="M3 8 C 12 20, 24 20, 32 12 M32 12 l -8 0 M32 12 l -1 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              )}
              <button
                className="icon-btn cal-btn"
                onClick={() => onCalendar(shown?.dayKey)}
                title="Past dailies — replay or catch up"
                aria-label="Past dailies calendar"
              >
                📅
              </button>
            </span>
          )}
        </div>

        {scoring ? (
          <p className="sheet-hint">🥁 scoring your run…</p>
        ) : runError ? (
          <>
            <p className="sheet-hint">
              Couldn't reach the server to score your run — your taps are safe, try again in a moment.
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
            {shown.archive && !shown.practice && (
              <p className="sheet-hint">made-up day — saved on your device, not the leaderboard</p>
            )}
            {/* The score is the headline — BPMs sit underneath, smaller, so a
                score of 96 is never mistaken for a tempo of 96. */}
            <div className="score-hero">
              <div className="score-big">
                <CountUp value={shown.score} />
                <span className="score-of">/100</span>
              </div>
              {!shown.practice && shown.rankToday !== undefined && (
                <button
                  className="rank-pill"
                  onClick={onLeaderboard}
                  title={getNickname() ? 'See the leaderboard' : 'Join the leaderboard'}
                >
                  #{shown.rankToday} out of {shown.playersToday} today <span aria-hidden="true">🏆</span>
                </button>
              )}
            </div>
            <div className="reveal-row">
              <div className="reveal-cell">
                <div className="reveal-num">{shown.guess}</div>
                <div className="reveal-cap">you tapped</div>
              </div>
              <div className="reveal-cell reveal-actual">
                <div className="reveal-num">{shown.actual ?? '—'}</div>
                <div className="reveal-cap">actual bpm</div>
              </div>
            </div>
            {todayPractice && (
              <div className="practice-result" key={todayPractice.guess * 1000 + todayPractice.score}>
                <span className="practice-tag" title="Practice tries don't count">
                  ↻ practice
                </span>
                <span>
                  <strong>{todayPractice.score}</strong>/100
                </span>
                <span className="practice-sub">tapped {todayPractice.guess}</span>
              </div>
            )}
            <div className="reveal-score">
              {ghost && !shown.practice && shownKey === ghost.day && (
                <span className="ghost-note">
                  🥊 {ghostName} scored {ghost.score}/100 —{' '}
                  {shown.score > ghost.score
                    ? 'you beat them!'
                    : shown.score === ghost.score
                      ? "it's a dead tie!"
                      : 'they still hold it'}
                </span>
              )}
              {octaveNote(shown.octave) && <span className="octave-note">{octaveNote(shown.octave)}</span>}
              {shown.wobble > 0 && (
                <span className="wobble-note">
                  −{shown.wobble} for an unsteady beat — finding the tempo is half the game, holding it
                  is the rest!
                </span>
              )}
            </div>
            {!sideRun && (
              <>
                <div className="daily-streak-row">
                  <span>🔥 {streak} day streak</span>
                  <HistoryDots results={results} todayKey={todayKey} />
                </div>
                {showInstallNudge && (
                  <p className="sheet-hint install-nudge">
                    {streak} days going — keep the streak one tap away:{' '}
                    {canPromptInstall() ? (
                      <button className="linklike" onClick={install} disabled={installBusy}>
                        install TempoTuner
                      </button>
                    ) : (
                      <>tap Share, then “Add to Home Screen”</>
                    )}
                    {' · '}
                    <button className="linklike" onClick={dismissInstall}>
                      don't ask again
                    </button>
                  </p>
                )}
              </>
            )}
            {ghostElsewhere}
            <div className="share-row">
              {sideRun ? (
                <button className="btn btn-primary" onClick={onDismissReveal}>
                  Back to today
                </button>
              ) : (
                <button className="btn btn-primary" onClick={share} disabled={busy}>
                  {busy ? 'Creating…' : copied ? 'Copied!' : 'Challenge a friend'}
                </button>
              )}
              {apiConfigured() && (
                <span className="listen-wrap">
                  <button
                    className={`icon-btn listen-btn${previewPlaying ? ' listen-on' : ''}`}
                    onClick={toggleListen}
                    disabled={preview !== null && !preview.url}
                    aria-label={previewPlaying ? 'Stop the song' : 'Listen to the original'}
                  >
                    {previewPlaying ? '◼' : '🔊'}
                  </button>
                  {/* hangs under the speaker; while playing it turns into the
                      Apple Music attribution */}
                  <span className="listen-callout squiggle">
                    {previewPlaying && preview?.trackUrl ? (
                      <a href={preview.trackUrl} target="_blank" rel="noreferrer">
                        from Apple Music ↗
                      </a>
                    ) : preview && !preview.url ? (
                      'no preview, sorry'
                    ) : (
                      'listen to the original'
                    )}
                    <svg className="listen-callout-arrow" viewBox="0 0 30 28" aria-hidden="true">
                      <path
                        d="M4 24 C 14 24, 22 18, 24 4 M24 4 l -6 6 M24 4 l 5 7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </span>
              )}
            </div>
            {shown.actual !== null && (
              <div className="sheet-actions sheet-actions-center">
                <button
                  className="btn btn-ghost btn-small"
                  onClick={() =>
                    onStartPractice(
                      shown.title,
                      shown.artist,
                      shown.actual!,
                      shown.dayKey && shown.dayNum ? { key: shown.dayKey, number: shown.dayNum } : null
                    )
                  }
                  title="Replay this song — the score isn't saved"
                >
                  ↻ Try again
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {ghost && ghost.day === todayKey && (
              <p className="sheet-hint ghost-banner">
                🥊 <strong>{ghostName}</strong> scored <strong>{ghost.score}/100</strong> on today's
                daily — beat that!
              </p>
            )}
            {ghostElsewhere}
            <p className="daily-pitch">
              Sing today's song in your head and tap its beat from memory — <strong>16 taps</strong>.
              How close to the real tempo can you get?
            </p>
            {startError && (
              <p className="sheet-hint start-error">
                Couldn't fetch today's song — are you online? Try again in a moment.
              </p>
            )}
            <div className="sheet-actions sheet-actions-center">
              <button className="btn btn-primary btn-big" onClick={start} disabled={startBusy}>
                {startBusy ? 'Starting…' : "Play today's song"}
              </button>
              <button className="btn btn-ghost" onClick={onDemo}>
                ▶ Show me how
              </button>
            </div>
            {streak > 0 && (
              <div className="daily-streak-row">
                <span>🔥 {streak} day streak — keep it going!</span>
                <HistoryDots results={results} todayKey={todayKey} />
              </div>
            )}
            <p className="sheet-hint sheet-fineprint">
              tap the steady pulse you'd clap along to, not every word · your first full run counts ·
              don't know the song? play a 🔊 clip mid-run
            </p>
          </>
        )}
      </section>
      {/* not part of the game — parked outside the card, bottom right */}
      {shown && !sideRun && !scoring && !runError && (
        <div className="home-listdle" data-no-tap>
          <a
            href="https://listdle.com/games/tempotuner"
            target="_blank"
            rel="noopener noreferrer"
            className="listdle-badge-link"
          >
            <img
              src={
                dark
                  ? 'https://listdle.com/badges/rate-on-listdle-dark.svg'
                  : 'https://listdle.com/badges/rate-on-listdle-light.svg'
              }
              alt="Rate on Listdle"
              height="40"
              className="listdle-badge"
            />
          </a>
        </div>
      )}
    </>
  );
};

export default DailyCard;
