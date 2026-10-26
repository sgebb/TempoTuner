import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Graph from './components/Graph';
import { TuningForkMark, ResetArrow } from './components/icons';
import HelpModal from './components/HelpModal';
import TargetSheet from './components/TargetSheet';
import DailyCard, { RunReveal } from './components/DailyCard';
import CalendarSheet from './components/CalendarSheet';
import { useMetronome } from './hooks/useMetronome';
import { useRecorder } from './hooks/useRecorder';
import { DEMO_BEATS, DEMO_SONG, useDemo } from './hooks/useDemo';
import { TapPoint, accuracyColor, computeStats, currentBpm, tapsToPoints } from './lib/tempo';
import {
  CHALLENGE_POINTS,
  DailyResults,
  dailyNumber,
  loadDailyResults,
  localDateKey,
  saveDailyResults,
  scoreRun,
} from './lib/daily';
import { playPreview, stopPreview } from './lib/preview';
import { fetchDaily, submitRun } from './lib/leaderboard';
import { Challenge, loadStoredChallenge, readChallengeFromUrl } from './lib/challenge';
import LeaderboardSheet from './components/LeaderboardSheet';

type Ripple = { id: number; x: number; y: number };

// Parsed before first render: a challenge link's ghost shows on the home card.
const urlChallenge = readChallengeFromUrl();

const readStoredTheme = (): boolean => {
  const raw = localStorage.getItem('tt-theme');
  if (raw === 'dark') return true;
  if (raw === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
};

const App = () => {
  const [taps, setTaps] = useState<number[]>([]);
  const [targetBpm, setTargetBpm] = useState<number | null>(null);
  const [dark, setDark] = useState(readStoredTheme);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const [lbOpen, setLbOpen] = useState(false);
  // a past day's board, opened from the calendar; null = today's
  const [lbDay, setLbDay] = useState<string | null>(null);
  // Home is the daily (its challenge, then its result); practice is the free
  // tap-along tool. A challenge or demo run takes over the screen from either.
  const [view, setView] = useState<'home' | 'practice'>('home');
  const [calOpen, setCalOpen] = useState(false);
  // The calendar's selected day outlives the sheet, so coming back from a
  // replay (or just reopening it) lands on the day you were looking at.
  const [calDay, setCalDay] = useState(localDateKey);
  // set while a run started from the calendar: quitting it reopens the calendar
  const runFromCalRef = useRef(false);
  // A friend's score to beat — fresh from the link, or remembered from one
  // opened earlier (a challenge shouldn't die with the tab).
  const [ghost] = useState<Challenge | null>(() => urlChallenge ?? loadStoredChallenge());
  const [dailyResults, setDailyResults] = useState<DailyResults>(loadDailyResults);
  // bpm is only known for practice replays (revealed by a scored run) and
  // archive replays of closed days; the real daily is scored server-side,
  // which owns the answer.
  const [challenge, setChallenge] = useState<{
    title: string;
    artist: string;
    bpm: number | null;
    practice: boolean;
    /** a closed past day being made up — scored locally, saved as `late` */
    archive: { key: string; number: number } | null;
    previewUrl: string | null;
  } | null>(null);
  const [runReveal, setRunReveal] = useState<RunReveal | null>(null);
  const [scoringRun, setScoringRun] = useState(false);
  const [runError, setRunError] = useState(false);
  const [clipPlaying, setClipPlaying] = useState(false);
  const pendingRunRef = useRef<{ title: string; artist: string; bpms: number[] } | null>(null);
  const rippleId = useRef(0);
  const metronomePendingRef = useRef(false);
  const activeTapRef = useRef<{
    pointerId: number;
    tapTime: number;
    rippleId: number;
    x: number;
    y: number;
  } | null>(null);

  const metronome = useMetronome();
  const recorder = useRecorder();
  const demo = useDemo();

  const points = useMemo(() => tapsToPoints(taps), [taps]);
  const bpm = useMemo(() => currentBpm(points), [points]);
  const stats = useMemo(() => computeStats(points), [points]);

  // The demo draws a perfectly steady run on the graph, one point per beat —
  // "this is what holding the tempo looks like".
  const demoPoints = useMemo<TapPoint[]>(() => {
    if (!demo.running || demo.beat < 0) return [];
    const interval = 60000 / DEMO_SONG.bpm;
    return Array.from({ length: demo.beat + 1 }, (_, i) => ({ t: i * interval, bpm: DEMO_SONG.bpm }));
  }, [demo.running, demo.beat]);

  const todayKey = localDateKey();
  const day = dailyNumber(todayKey);
  const todayResult = dailyResults[todayKey];
  const inRun = challenge !== null || demo.running;
  // taps only count where there's something to tap: a run or practice mode
  const tapping = inRun || view === 'practice';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('tt-theme', dark ? 'dark' : 'light');
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#12121c' : '#fdf8ef');
  }, [dark]);

  const spawnRipple = useCallback((x: number, y: number) => {
    const id = ++rippleId.current;
    setRipples((prev) => [...prev.slice(-6), { id, x, y }]);
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 700);
    return id;
  }, []);

  const registerTap = useCallback(
    (x: number, y: number) => {
      const tapTime = performance.now();
      setTaps((prev) => [...prev, tapTime]);
      return { tapTime, rippleId: spawnRipple(x, y) };
    },
    [spawnRipple]
  );

  // Demo: a ripple on every beat shows exactly where the taps should land.
  useEffect(() => {
    if (!demo.running || demo.beat < 0) return;
    spawnRipple(window.innerWidth / 2, window.innerHeight * 0.35);
  }, [demo.running, demo.beat, spawnRipple]);

  // A tap is counted on pointerdown (for timing accuracy) but withdrawn if the
  // finger then travels — so pulls, swipes and edge gestures don't count as beats.
  const SWIPE_CANCEL_PX = 12;

  const cancelActiveTap = useCallback(() => {
    const active = activeTapRef.current;
    if (!active) return;
    activeTapRef.current = null;
    setTaps((prev) => prev.filter((t) => t !== active.tapTime));
    setRipples((prev) => prev.filter((r) => r.id !== active.rippleId));
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!tapping) return;
    const target = e.target as Element;
    if (target.closest('button, input, textarea, a, [data-no-tap]')) return;
    // While a recording plays you're reviewing, not practicing — taps on the
    // graph seek (handled there), taps elsewhere shouldn't count as beats.
    // During the demo you're watching, not tapping. During the challenge clip
    // you're listening at a scrambled tempo — tapping along would be nonsense.
    if (recorder.status === 'playing' || demo.running || clipPlaying) return;
    const { tapTime, rippleId: rid } = registerTap(e.clientX, e.clientY);
    activeTapRef.current = { pointerId: e.pointerId, tapTime, rippleId: rid, x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const active = activeTapRef.current;
    if (!active || e.pointerId !== active.pointerId) return;
    if (Math.hypot(e.clientX - active.x, e.clientY - active.y) > SWIPE_CANCEL_PX) cancelActiveTap();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTapRef.current?.pointerId === e.pointerId) activeTapRef.current = null;
  };

  // pointercancel = the browser claimed the gesture (pull-to-refresh, back swipe…)
  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTapRef.current?.pointerId === e.pointerId) cancelActiveTap();
  };

  const sheetOpen = helpOpen || targetOpen || lbOpen || calOpen;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (!tapping || demo.running || clipPlaying || sheetOpen) return;
      const target = e.target as Element;
      if (target.closest('button, input, textarea, [data-no-tap]')) return;
      e.preventDefault();
      registerTap(window.innerWidth / 2, window.innerHeight / 2);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [registerTap, tapping, demo.running, clipPlaying, sheetOpen]);

  const reset = () => {
    setTaps([]);
    recorder.clear();
    metronome.stop();
    demo.stop();
    stopPreview();
  };

  const cancelChallenge = () => {
    setChallenge(null);
    setTaps([]);
    stopPreview();
    if (runFromCalRef.current) setCalOpen(true);
    runFromCalRef.current = false;
  };

  // Practice always starts blank: no taps, no recording, no target.
  const openPractice = () => {
    reset();
    setTargetBpm(null);
    setRunReveal(null);
    setView('practice');
  };

  // Nothing may keep clicking or recording behind the home screen (and
  // practice starts blank next time anyway).
  const leavePractice = () => {
    reset();
    setView('home');
  };

  // Logo click = "take me home": leave whatever is running or open; if already
  // home with nothing open, drop a replay's reveal and show today again.
  const goHome = () => {
    const somethingToLeave = inRun || sheetOpen || view !== 'home';
    if (challenge) {
      runFromCalRef.current = false;
      cancelChallenge();
    }
    if (demo.running) demo.stop();
    setHelpOpen(false);
    setTargetOpen(false);
    setLbOpen(false);
    setLbDay(null);
    setCalOpen(false);
    if (view !== 'home') leavePractice();
    if (!somethingToLeave) setRunReveal(null);
  };

  const openCalendar = (dayKey?: string) => {
    if (dayKey) setCalDay(dayKey);
    setCalOpen(true);
  };

  // Every run starts from a clean slate, wherever it was launched from.
  const beginRun = () => {
    reset();
    setRunReveal(null);
    setRunError(false);
    pendingRunRef.current = null;
    runFromCalRef.current = calOpen;
    setCalOpen(false);
  };

  // The real daily: ask the server what today's song is (title/artist only —
  // the BPM never reaches the client before the run is scored).
  const startDaily = async () => {
    const info = await fetchDaily(todayKey); // throws → the caller shows the error
    beginRun();
    setChallenge({
      title: info.title,
      artist: info.artist,
      bpm: null,
      practice: false,
      archive: null,
      previewUrl: info.previewUrl ?? null,
    });
  };

  // "Try again" and calendar replays: the same blind run of a song whose BPM
  // a scored run already revealed — scored locally, never saved or submitted.
  // Replays of a specific day carry its key/number so the reveal stays
  // labeled as that day (the save guard skips days that already have a result).
  const startPractice = (
    title: string,
    artist: string,
    bpm: number,
    archive: { key: string; number: number } | null = null
  ) => {
    beginRun();
    setChallenge({ title, artist, bpm, practice: true, archive, previewUrl: null });
  };

  // A missed day from the calendar: the server reveals a closed day's BPM,
  // so the run is scored locally and saved as `late` — never the leaderboard.
  const startArchive = async (dayKey: string) => {
    const info = await fetchDaily(dayKey); // throws → the calendar shows the error
    // no bpm → the day is still open somewhere on Earth; the answer stays hidden
    if (info.bpm == null) throw new Error('open');
    beginRun();
    setChallenge({
      title: info.title,
      artist: info.artist,
      bpm: info.bpm,
      practice: false,
      archive: { key: dayKey, number: info.number },
      previewUrl: info.previewUrl ?? null,
    });
  };

  // "Don't know the song?" — the clip plays inside a modal, tempo-scrambled
  // so it never leaks the answer (that's why it's free). Listening restarts
  // the run: the taps so far are cleared. The modal closes itself when the
  // clip ends; closing it early stops the clip (stopPreview fires onDone).
  const openClip = () => {
    if (!challenge?.previewUrl || clipPlaying) return;
    setTaps([]);
    setClipPlaying(true);
    playPreview(challenge.previewUrl, { scramble: true, onDone: () => setClipPlaying(false) });
  };

  // The demo runs in the daily's own run view (that's the point of the demo);
  // when it ends (or is stopped) you're back on the home card.
  const startDemo = () => {
    reset();
    setRunReveal(null);
    demo.start();
  };

  // Send the pending real run to the server for scoring; the reveal (and the
  // actual BPM) come back in the response. Kept callable for the retry button.
  const scorePendingRun = useCallback(async () => {
    const pending = pendingRunRef.current;
    if (!pending) return;
    setRunError(false);
    setScoringRun(true);
    try {
      const res = await submitRun(todayKey, pending.bpms);
      const practice = !!dailyResults[todayKey]; // played already → doesn't count
      if (!practice) {
        const next = {
          ...dailyResults,
          [todayKey]: {
            day,
            guess: res.guess,
            score: res.score,
            bpms: pending.bpms,
            title: pending.title,
            artist: pending.artist,
            actual: res.actualBpm,
            rankToday: res.rankToday,
            playersToday: res.playersToday,
          },
        };
        setDailyResults(next);
        saveDailyResults(next);
      }
      setRunReveal({
        title: pending.title,
        artist: pending.artist,
        actual: res.actualBpm,
        guess: res.guess,
        score: res.score,
        octave: res.octave,
        wobble: res.wobble,
        practice,
        rankToday: res.rankToday,
        playersToday: res.playersToday,
      });
      pendingRunRef.current = null;
    } catch {
      setRunError(true);
    } finally {
      setScoringRun(false);
    }
  }, [todayKey, dailyResults, day]);

  // A challenge run ends itself after enough valid intervals and lands on the
  // home card, which shows the reveal. Runs with a known BPM (practice and
  // archive replays) score locally; the real daily goes to the server, which
  // owns the answer.
  useEffect(() => {
    if (!challenge || points.length < CHALLENGE_POINTS) return;
    const bpms = points.map((p) => Math.round(p.bpm));
    const { title, artist, bpm, practice, archive } = challenge;
    setChallenge(null);
    setTaps([]);
    setView('home');
    runFromCalRef.current = false;
    stopPreview();
    if (bpm !== null) {
      const { guess, octave, wobble, score } = scoreRun(bpms, bpm);
      if (archive && !dailyResults[archive.key]) {
        // first make-up run for that day wins, like the real daily
        const next: DailyResults = {
          ...dailyResults,
          [archive.key]: {
            day: archive.number,
            guess,
            score,
            bpms,
            title,
            artist,
            actual: bpm,
            late: true,
          },
        };
        setDailyResults(next);
        saveDailyResults(next);
      }
      setRunReveal({
        title,
        artist,
        actual: bpm,
        guess,
        score,
        octave,
        wobble,
        practice,
        archive: archive !== null,
        dayNum: archive?.number,
        dayKey: archive?.key,
      });
      return;
    }
    pendingRunRef.current = { title, artist, bpms };
    void scorePendingRun();
  }, [challenge, points, scorePendingRun, dailyResults]);

  const toggleMetronome = () => {
    if (metronome.isOn) metronome.stop();
    else if (targetBpm === null) {
      // metronome needs a tempo — ask for one, then start once it's set
      metronomePendingRef.current = true;
      setTargetOpen(true);
    } else metronome.start(targetBpm);
  };

  const toggleRecord = () => {
    if (recorder.status === 'recording') recorder.stopRecording();
    else recorder.startRecording();
  };

  const togglePlay = () => {
    if (recorder.status === 'playing') recorder.stopPlayback();
    else recorder.play();
  };

  const hasSession = taps.length > 0;
  const bpmColor = bpm !== null ? accuracyColor(bpm, targetBpm) : 'var(--fg)';
  const home = !inRun && view === 'home';

  return (
    <div
      className={`app${home ? ' app-home' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <header className="topbar" data-no-tap>
        <h1 className="logo">
          <button className="logo-btn" onClick={goHome} aria-label="TempoTuner — home">
            <TuningForkMark size={30} />
            TempoTuner
          </button>
        </h1>
        {!inRun && (
          <span className="topbar-buttons">
            <button
              className="icon-btn"
              onClick={() => setDark((d) => !d)}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={dark ? 'Light mode' : 'Dark mode'}
            >
              {dark ? '☀' : '☾'}
            </button>
            <button className="icon-btn" onClick={() => setLbOpen(true)} aria-label="Leaderboard" title="Leaderboard">
              🏆
            </button>
            <button className="icon-btn" onClick={() => setHelpOpen(true)} aria-label="Help" title="What is TempoTuner?">
              ?
            </button>
          </span>
        )}
      </header>

      {home ? (
        <>
          <main className="home">
            {todayResult ? (
              // played → the next thing to do is see where you landed
              <p className="squiggle lb-callout" aria-hidden="true">
                check the leaderboards
                <svg className="lb-callout-arrow" viewBox="0 0 34 40">
                  <path
                    d="M3 34 C 18 34, 28 24, 28 5 M28 5 l -7 7 M28 5 l 6 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </p>
            ) : (
              <p className="squiggle tagline home-tagline">how well do you know the beat?</p>
            )}
            <DailyCard
              todayKey={todayKey}
              day={day}
              dark={dark}
              results={dailyResults}
              ghost={ghost}
              reveal={runReveal}
              scoring={scoringRun}
              runError={runError}
              onRetryRun={scorePendingRun}
              onStartDaily={startDaily}
              onStartPractice={startPractice}
              onDemo={startDemo}
              onLeaderboard={() => setLbOpen(true)}
              onCalendar={openCalendar}
              onDismissReveal={() => setRunReveal(null)}
            />
          </main>
          <footer className="home-footer" data-no-tap>
            <button className="practice-btn" onClick={openPractice}>
              <span className="practice-btn-icon" aria-hidden="true">
                🥁
              </span>
              <span className="practice-btn-text">
                <strong>Practice mode</strong>
                <span>free tapping · metronome · recording</span>
              </span>
              <span className="practice-btn-arrow" aria-hidden="true">
                ›
              </span>
            </button>
          </footer>
        </>
      ) : (
        <>
          {challenge ? (
            <div className="challenge-title">
              <strong>🎵 {challenge.title}</strong>
              <span>
                {challenge.artist}
                {challenge.archive ? ` — daily #${challenge.archive.number}` : ''}
              </span>
            </div>
          ) : demo.running ? (
            <div className="challenge-title">
              <strong>🎵 {DEMO_SONG.title}</strong>
              <span>{DEMO_SONG.artist} — demo</span>
            </div>
          ) : (
            <p className="squiggle tagline">sing something &amp; tap anywhere to the beat!</p>
          )}

          <main className="bpm-zone">
            {challenge ? (
              <>
                <div className="bpm-big challenge-progress" key={points.length}>
                  {Math.min(points.length, CHALLENGE_POINTS)}
                  <span className="challenge-total">/{CHALLENGE_POINTS}</span>
                </div>
                <div className="bpm-label">taps</div>
              </>
            ) : demo.running ? (
              <>
                <div className="bpm-big demo-lyric" key={demo.beat}>
                  {demo.beat >= 0 ? DEMO_BEATS[demo.beat].lyric : '🎵'}
                </div>
                <div className="bpm-label">
                  {demo.beat >= 0 ? `tap ${demo.beat + 1} / ${DEMO_BEATS.length}` : 'listen…'}
                </div>
              </>
            ) : (
              <>
                <div className="bpm-row" data-no-tap>
                  <span className="bpm-side">
                    <button className="chip back-chip" onClick={leavePractice} title="Back to the daily">
                      ‹ Daily
                    </button>
                  </span>
                  <div className="bpm-mid">
                    <div
                      className={`bpm-big ${bpm !== null ? '' : 'bpm-empty'}`}
                      style={{ color: bpmColor }}
                      key={taps.length}
                    >
                      {bpm ?? '· ·'}
                    </div>
                    <div className="bpm-label">BPM</div>
                  </div>
                  <span className="bpm-side bpm-side-right">
                    <button
                      className={`icon-btn target-btn ${targetBpm !== null ? 'target-set' : ''}`}
                      onClick={() => setTargetOpen(true)}
                      title="Set a target tempo"
                      aria-label={targetBpm !== null ? `Target ${targetBpm} BPM` : 'Set a target BPM'}
                    >
                      <span className="target-emoji" aria-hidden="true">
                        🎯
                      </span>
                      <span className="target-val">{targetBpm ?? 'target'}</span>
                    </button>
                  </span>
                </div>
                {targetBpm === null ? (
                  <div className="target-hint squiggle" data-no-tap aria-hidden="true">
                    set a target BPM
                    <svg className="target-hint-arrow" viewBox="0 0 36 30">
                      <path
                        d="M4 26 C 15 21, 25 13, 30 4 M30 4 l -7 3 M30 4 l 2 8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                ) : null}
              </>
            )}
          </main>

          <section className="graph-area">
            {!inRun && (hasSession || recorder.hasRecording) && (
              <button
                className="icon-btn graph-reset"
                data-no-tap
                onClick={reset}
                title="Clear taps and recording"
                aria-label="Reset"
              >
                <ResetArrow size={19} />
              </button>
            )}
            {(demo.running ? demoPoints.length === 0 : points.length === 0 && recorder.volume.length === 0) ? (
              <div className="graph-empty squiggle">
                <div>
                  {challenge ? (
                    <>
                      your taps draw here —
                      <br />
                      numbers come when you're done
                    </>
                  ) : demo.running ? (
                    <>watch the beat draw a steady line</>
                  ) : (
                    <>
                      was I rushing? dragging? steady?
                      <br />
                      your tempo graph shows up here
                    </>
                  )}
                </div>
              </div>
            ) : (
              <Graph
                points={demo.running ? demoPoints : points}
                targetBpm={inRun ? null : targetBpm}
                volume={recorder.volume}
                playbackTime={recorder.playbackTime}
                onSeek={!inRun && recorder.status === 'playing' ? recorder.seek : null}
                blind={inRun}
              />
            )}
            <div className="stats-row">
              {challenge ? (
                <span className="stats-placeholder">the score comes at the end</span>
              ) : demo.running ? (
                <span className="stats-placeholder">hear how “star” holds on while the beat keeps ticking</span>
              ) : stats ? (
                <>
                  <span>
                    avg <strong>{stats.avg}</strong>
                  </span>
                  <span>
                    beats <strong>{stats.count + 1}</strong>
                  </span>
                </>
              ) : (
                <span className="stats-placeholder">
                  {hasSession ? 'keep tapping…' : 'stats appear after a few taps'}
                </span>
              )}
            </div>
          </section>

          {challenge ? (
            <>
              <div className="controls-hint squiggle" data-no-tap aria-hidden="true">
                {!challenge.practice && challenge.previewUrl && (
                  <span className="hint-inner hint-right">
                    forgot how it goes? it plays at the wrong speed — on purpose!
                    <svg className="hint-arrow" viewBox="0 0 40 60">
                      <path
                        d="M8 8 C 28 12, 34 28, 26 50 M26 50 l -2 -10 M26 50 l 10 -5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                )}
              </div>
              <nav className="controls" data-no-tap>
                <button className="btn" onClick={cancelChallenge}>
                  <span className="btn-icon">✕</span>
                  quit
                </button>
                {!challenge.practice && challenge.previewUrl && (
                  <button className="btn" onClick={openClip}>
                    <span className="btn-icon">🔊</span>
                    listen
                  </button>
                )}
              </nav>
            </>
          ) : demo.running ? (
            <>
              <div className="controls-hint squiggle" data-no-tap aria-hidden="true" />
              <nav className="controls" data-no-tap>
                <button className="btn" onClick={() => demo.stop()}>
                  <span className="btn-icon">✕</span>
                  stop demo
                </button>
              </nav>
            </>
          ) : (
            <>
              <div className="controls-hint squiggle" data-no-tap aria-hidden="true">
                {targetBpm !== null && !hasSession && !metronome.isOn ? (
                  <span className="hint-inner hint-left">
                    <svg className="hint-arrow" viewBox="0 0 40 60">
                      <path
                        d="M32 8 C 12 12, 6 28, 14 50 M14 50 l 2 -10 M14 50 l -10 -5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    start the metronome and try to hold its beat
                  </span>
                ) : hasSession && !recorder.hasRecording && recorder.status === 'idle' ? (
                  <span className="hint-inner hint-center">
                    record yourself to hear where your tempo drifted
                    <svg className="hint-arrow" viewBox="0 0 40 60">
                      <path
                        d="M8 8 C 28 12, 34 28, 26 50 M26 50 l -2 -10 M26 50 l 10 -5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                ) : null}
              </div>
              <nav className="controls" data-no-tap>
                <button
                  className={`btn ${metronome.isOn ? 'btn-active' : ''}`}
                  onClick={toggleMetronome}
                  title={
                    targetBpm === null
                      ? 'Pick a target tempo for the metronome'
                      : 'Metronome clicks at your target tempo'
                  }
                >
                  <span className="btn-icon">{metronome.isOn ? '◼' : '♪'}</span>
                  {metronome.isOn ? 'stop' : 'metronome'}
                </button>
                <button
                  className={`btn ${recorder.status === 'recording' ? 'btn-recording' : ''}`}
                  onClick={toggleRecord}
                  title="Record yourself while tapping"
                >
                  <span className="btn-icon">{recorder.status === 'recording' ? '◼' : '●'}</span>
                  {recorder.status === 'recording' ? 'stop' : 'record'}
                </button>
                {recorder.hasRecording && (
                  <button
                    className={`btn ${recorder.status === 'playing' ? 'btn-active' : ''}`}
                    onClick={togglePlay}
                  >
                    <span className="btn-icon">{recorder.status === 'playing' ? '◼' : '▶'}</span>
                    {recorder.status === 'playing' ? 'stop' : 'play'}
                  </button>
                )}
              </nav>
            </>
          )}
        </>
      )}

      {recorder.status === 'denied' && (
        <div className="toast" data-no-tap>
          Microphone blocked — allow mic access to record.
        </div>
      )}

      {ripples.map((r) => (
        <span key={r.id} className="ripple" style={{ left: r.x, top: r.y }} aria-hidden="true" />
      ))}

      {clipPlaying && challenge && (
        <div className="overlay overlay-center" data-no-tap>
          <div className="sheet clip-sheet">
            <div className="sheet-header">
              <h2>🔊 {challenge.title}</h2>
              <button className="icon-btn" onClick={() => stopPreview()} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="clip-wrong-prefix squiggle">heads up —</div>
            <div className="clip-wrong">wrong speed!</div>
            <p className="sheet-hint">
              The pitch is real but the tempo is scrambled on purpose — hear how the song goes,
              then find its real beat yourself. Your taps restart when you close this.
            </p>
            <div className="sheet-actions">
              <button className="btn btn-primary" onClick={() => stopPreview()}>
                Done — let me tap
              </button>
            </div>
          </div>
        </div>
      )}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {calOpen && !inRun && (
        <CalendarSheet
          results={dailyResults}
          todayKey={todayKey}
          selected={calDay}
          onSelect={setCalDay}
          onClose={() => setCalOpen(false)}
          onStartDaily={startDaily}
          onStartArchive={startArchive}
          onStartPractice={startPractice}
          onLeaderboard={(dayKey) => {
            setLbDay(dayKey === todayKey ? null : dayKey);
            setLbOpen(true);
          }}
        />
      )}
      {lbOpen && (
        <LeaderboardSheet
          todayKey={lbDay ?? todayKey}
          day={lbDay ? dailyNumber(lbDay) : day}
          past={lbDay !== null}
          todayResult={lbDay ? undefined : todayResult}
          onClose={() => {
            setLbOpen(false);
            setLbDay(null);
          }}
        />
      )}
      {targetOpen && (
        <TargetSheet
          targetBpm={targetBpm}
          averageBpm={stats?.avg ?? null}
          onSet={(v) => {
            setTargetBpm(v);
            if (v === null) metronome.stop();
            else if (metronome.isOn || metronomePendingRef.current) metronome.start(v);
          }}
          onClose={() => {
            setTargetOpen(false);
            metronomePendingRef.current = false;
          }}
        />
      )}
    </div>
  );
};

export default App;
