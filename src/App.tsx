import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Graph from './components/Graph';
import { MetronomeMark, ResetArrow } from './components/icons';
import HelpModal from './components/HelpModal';
import TargetSheet from './components/TargetSheet';
import DailyModal, { RunReveal } from './components/DailyModal';
import ConsentBanner from './components/ConsentBanner';
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
import LeaderboardSheet from './components/LeaderboardSheet';

type Ripple = { id: number; x: number; y: number };

const readStoredTarget = (): number | null => {
  const raw = localStorage.getItem('tt-target');
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
};

const readStoredTheme = (): boolean => {
  const raw = localStorage.getItem('tt-theme');
  if (raw === 'dark') return true;
  if (raw === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
};

const App = () => {
  const [taps, setTaps] = useState<number[]>([]);
  const [targetBpm, setTargetBpm] = useState<number | null>(readStoredTarget);
  const [dark, setDark] = useState(readStoredTheme);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const [lbOpen, setLbOpen] = useState(false);
  // The daily's intro/result modal — the daily is an episode launched from the
  // topbar button, not a separate mode; the practice page is the only page.
  const [dailyModalOpen, setDailyModalOpen] = useState(false);
  // Once per day until played, a modal nudge points at the daily — it doubles
  // as the introduction, since its play button takes you straight there.
  const [nudgeOpen, setNudgeOpen] = useState(() => {
    const key = localDateKey();
    return !loadDailyResults()[key] && localStorage.getItem('tt-daily-prompted') !== key;
  });
  const [dailyResults, setDailyResults] = useState<DailyResults>(loadDailyResults);
  // bpm is only known for practice replays (revealed by a scored run); the
  // real daily is scored server-side, which owns the answer.
  const [challenge, setChallenge] = useState<{
    title: string;
    artist: string;
    bpm: number | null;
    practice: boolean;
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
  const stats = useMemo(() => computeStats(points, targetBpm), [points, targetBpm]);

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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('tt-theme', dark ? 'dark' : 'light');
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#12121c' : '#fdf8ef');
  }, [dark]);

  useEffect(() => {
    if (targetBpm === null) localStorage.removeItem('tt-target');
    else localStorage.setItem('tt-target', String(targetBpm));
  }, [targetBpm]);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (demo.running || clipPlaying) return;
      // a rhythm space press right after the 16th tap must not land as a
      // stray tap behind the modal that just opened
      if (dailyModalOpen || nudgeOpen) return;
      const target = e.target as Element;
      if (target.closest('button, input, textarea, [data-no-tap]')) return;
      e.preventDefault();
      registerTap(window.innerWidth / 2, window.innerHeight / 2);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [registerTap, demo.running, clipPlaying, dailyModalOpen, nudgeOpen]);

  const reset = () => {
    setTaps([]);
    recorder.clear();
    metronome.stop();
    demo.stop();
    stopPreview();
  };

  const dismissNudge = () => {
    localStorage.setItem('tt-daily-prompted', todayKey);
    setNudgeOpen(false);
  };

  const openDaily = () => {
    dismissNudge();
    setDailyModalOpen(true);
  };

  const cancelChallenge = () => {
    setChallenge(null);
    setTaps([]);
    stopPreview();
  };

  // Logo click = "take me home": leave whatever is running or open; if already
  // on a bare practice screen, refresh it (clear taps & recording).
  const goHome = () => {
    const somethingToLeave =
      challenge !== null || demo.running || dailyModalOpen || helpOpen || targetOpen || lbOpen || nudgeOpen;
    if (challenge) cancelChallenge();
    if (demo.running) demo.stop();
    setHelpOpen(false);
    setTargetOpen(false);
    setLbOpen(false);
    setDailyModalOpen(false);
    if (nudgeOpen) dismissNudge();
    if (!somethingToLeave) reset();
  };

  // The real daily: ask the server what today's song is (title/artist only —
  // the BPM never reaches the client before the run is scored).
  const startDaily = async () => {
    const info = await fetchDaily(todayKey); // throws → DailyModal shows the error
    reset();
    setRunReveal(null);
    setRunError(false);
    pendingRunRef.current = null;
    setChallenge({
      title: info.title,
      artist: info.artist,
      bpm: null,
      practice: false,
      previewUrl: info.previewUrl ?? null,
    });
    setDailyModalOpen(false);
  };

  // "Try again" replays a song whose BPM a scored run already revealed —
  // the same blind run, but the score can't be submitted.
  const startPractice = (title: string, artist: string, bpm: number) => {
    reset();
    setRunReveal(null);
    setRunError(false);
    pendingRunRef.current = null;
    setChallenge({ title, artist, bpm, practice: true, previewUrl: null });
    setDailyModalOpen(false);
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
  // when it ends (or is stopped) the daily modal comes back.
  const startDemo = () => {
    reset();
    setRunReveal(null);
    setDailyModalOpen(false);
    demo.start(() => setDailyModalOpen(true));
  };

  const stopDemo = () => {
    demo.stop();
    setDailyModalOpen(true);
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

  // A challenge run ends itself after enough valid intervals. Practice runs
  // (BPM known from an earlier reveal) score locally; the real daily goes to
  // the server, which owns the answer.
  useEffect(() => {
    if (!challenge || points.length < CHALLENGE_POINTS) return;
    const bpms = points.map((p) => Math.round(p.bpm));
    const { title, artist, bpm, practice } = challenge;
    setChallenge(null);
    setDailyModalOpen(true); // the reveal shows in the daily modal
    stopPreview();
    if (practice && bpm !== null) {
      const { guess, octave, wobble, score } = scoreRun(bpms, bpm);
      setRunReveal({ title, artist, actual: bpm, guess, score, octave, wobble, practice: true });
      return;
    }
    pendingRunRef.current = { title, artist, bpms };
    void scorePendingRun();
  }, [challenge, points, scorePendingRun]);

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
  const inRun = challenge !== null || demo.running;

  return (
    <div
      className="app"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <header className="topbar" data-no-tap>
        <h1 className="logo">
          <button className="logo-btn" onClick={goHome} aria-label="TempoTuner — home">
            <MetronomeMark size={30} />
            TempoTuner
          </button>
        </h1>
        {!inRun && (
          <span className="topbar-buttons">
            <button className="daily-btn" onClick={openDaily} title="Daily tempo challenge">
              🎵 daily #{day}
              {!todayResult && <span className="pulse-dot" aria-hidden="true" />}
            </button>
            <button className="icon-btn" onClick={() => setLbOpen(true)} aria-label="Leaderboard">
              🏆
            </button>
          </span>
        )}
      </header>

      {challenge ? (
        <div className="challenge-title">
          <strong>🎵 {challenge.title}</strong>
          <span>{challenge.artist}</span>
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
              <span className="bpm-side bpm-stack">
                <button className="icon-btn" onClick={() => setHelpOpen(true)} aria-label="Help">
                  ?
                </button>
                <button
                  className="icon-btn"
                  onClick={() => setDark((d) => !d)}
                  aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {dark ? '☀' : '☾'}
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
                  {targetBpm !== null && <span className="target-val">{targetBpm}</span>}
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
                score <strong>{stats.score}</strong>/100
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
            <button className="btn" onClick={stopDemo}>
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

      {recorder.status === 'denied' && (
        <div className="toast" data-no-tap>
          Microphone blocked — allow mic access to record.
        </div>
      )}

      {ripples.map((r) => (
        <span key={r.id} className="ripple" style={{ left: r.x, top: r.y }} aria-hidden="true" />
      ))}

      <ConsentBanner />
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
      {nudgeOpen && !inRun && (
        <div className="overlay overlay-center" data-no-tap>
          <div className="sheet nudge-sheet">
            <div className="sheet-header">
              <h2>🎵 Daily #{day}</h2>
              <button className="icon-btn" onClick={dismissNudge} aria-label="Not now">
                ✕
              </button>
            </div>
            <p className="sheet-hint">
              Today's challenge is ready — tap a well-known song's beat from memory and see how
              close you land.
            </p>
            <div className="sheet-actions">
              <button className="btn btn-ghost" onClick={dismissNudge}>
                Later
              </button>
              <button className="btn btn-primary" onClick={openDaily}>
                Play today's daily
              </button>
            </div>
          </div>
        </div>
      )}
      {dailyModalOpen && !inRun && (
        <DailyModal
          todayKey={todayKey}
          day={day}
          dark={dark}
          results={dailyResults}
          reveal={runReveal}
          scoring={scoringRun}
          runError={runError}
          onRetryRun={scorePendingRun}
          onStartDaily={startDaily}
          onStartPractice={startPractice}
          onDemo={startDemo}
          onLeaderboard={() => setLbOpen(true)}
          onClose={() => {
            setDailyModalOpen(false);
            setRunReveal(null);
          }}
        />
      )}
      {lbOpen && (
        <LeaderboardSheet
          todayKey={todayKey}
          day={day}
          todayResult={todayResult}
          onClose={() => setLbOpen(false)}
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
