import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Graph from './components/Graph';
import { Bullseye, MetronomeMark } from './components/icons';
import HelpModal from './components/HelpModal';
import TargetSheet from './components/TargetSheet';
import DailySheet, { RunReveal } from './components/DailySheet';
import ConsentBanner from './components/ConsentBanner';
import { useMetronome } from './hooks/useMetronome';
import { useRecorder } from './hooks/useRecorder';
import { DEMO_BEATS, DEMO_SONG, useDemo } from './hooks/useDemo';
import { accuracyColor, computeStats, currentBpm, tapsToPoints } from './lib/tempo';
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
  // The daily challenge greets you (Wordle-style) until played — but only once
  // per day, so dismissing it leaves just the pulsing chip as a nudge.
  const [dailyOpen, setDailyOpen] = useState(() => {
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
  // tap-along practice: the real clip plays at normal speed while taps stay live
  const [songPlaying, setSongPlaying] = useState(false);
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
      const target = e.target as Element;
      if (target.closest('button, input, textarea, [data-no-tap]')) return;
      e.preventDefault();
      registerTap(window.innerWidth / 2, window.innerHeight / 2);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [registerTap, demo.running, clipPlaying]);

  const reset = () => {
    setTaps([]);
    recorder.clear();
    metronome.stop();
    demo.stop();
    stopPreview();
  };

  const dismissDaily = () => {
    localStorage.setItem('tt-daily-prompted', todayKey);
    setDailyOpen(false);
  };

  // The real daily: ask the server what today's song is (title/artist only —
  // the BPM never reaches the client before the run is scored).
  const startDaily = async () => {
    const info = await fetchDaily(todayKey); // throws → DailySheet shows the error
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
    dismissDaily();
  };

  // Practice replays a song whose BPM a scored run already revealed.
  const startPractice = (title: string, artist: string, bpm: number) => {
    reset();
    setRunReveal(null);
    setRunError(false);
    pendingRunRef.current = null;
    setChallenge({ title, artist, bpm, practice: true, previewUrl: null });
    dismissDaily();
  };

  const cancelChallenge = () => {
    setChallenge(null);
    setTaps([]);
    stopPreview();
  };

  // "Don't know the song?" — play the clip, tempo-scrambled so it never
  // leaks the answer (that's why it's free). Listening restarts the run:
  // the taps so far are cleared, and tapping pauses while it plays.
  const toggleClip = () => {
    if (clipPlaying) {
      stopPreview();
      return;
    }
    if (!challenge?.previewUrl) return;
    setTaps([]);
    setClipPlaying(true);
    playPreview(challenge.previewUrl, { scramble: true, onDone: () => setClipPlaying(false) });
  };

  // The demo returns you to the daily sheet when it ends (or is stopped).
  const startDemo = () => {
    reset();
    setRunReveal(null);
    dismissDaily();
    demo.start(() => setDailyOpen(true));
  };

  const stopDemo = () => {
    demo.stop();
    setDailyOpen(true);
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
    setDailyOpen(true);
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
          <MetronomeMark size={30} />
          TempoTuner
        </h1>
        <span className="topbar-buttons">
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
      </header>

      {challenge ? (
        <div className="challenge-title">
          <strong>🎵 {challenge.title}</strong>
          <span>{challenge.artist}</span>
        </div>
      ) : demo.running ? (
        <p className="squiggle tagline challenge-song">🎵 {DEMO_SONG.title} — demo</p>
      ) : songPlaying ? (
        <p className="squiggle tagline">🎵 tap along — how close can you track it?</p>
      ) : (
        <p className="squiggle tagline">sing something &amp; tap anywhere to the beat!</p>
      )}

      <main className="bpm-zone">
        {challenge ? (
          <>
            {clipPlaying ? (
              <>
                <div className="bpm-big clip-wrong">wrong speed!</div>
                <div className="bpm-label">on purpose — don't tap along</div>
              </>
            ) : (
              <>
                <div className="bpm-big challenge-progress" key={points.length}>
                  {Math.min(points.length, CHALLENGE_POINTS)}
                  <span className="challenge-total">/{CHALLENGE_POINTS}</span>
                </div>
                <div className="bpm-label">taps</div>
              </>
            )}
            <div className="chip-row" data-no-tap>
              <button className="target-chip" onClick={cancelChallenge}>
                ✕ stop challenge
              </button>
              {!challenge.practice && challenge.previewUrl && (
                <button className="target-chip" onClick={toggleClip}>
                  {clipPlaying ? '◼ stop clip' : '🔊 remind me how it goes'}
                </button>
              )}
            </div>
          </>
        ) : demo.running ? (
          <>
            <div className="bpm-big demo-lyric" key={demo.beat}>
              {demo.beat >= 0 ? DEMO_BEATS[demo.beat].lyric : '🎵'}
            </div>
            <div className="bpm-label">
              {demo.beat >= 0 ? `tap ${demo.beat + 1} / ${DEMO_BEATS.length}` : 'listen…'}
            </div>
            <button className="target-chip" data-no-tap onClick={stopDemo}>
              ✕ stop demo
            </button>
          </>
        ) : (
          <>
            <div className={`bpm-big ${bpm !== null ? '' : 'bpm-empty'}`} style={{ color: bpmColor }} key={taps.length}>
              {bpm ?? '· ·'}
            </div>
            <div className="bpm-label">BPM</div>
            <div className="chip-row" data-no-tap>
              <button className="target-chip" onClick={() => setTargetOpen(true)}>
                {targetBpm !== null ? (
                  <>
                    <Bullseye /> target {targetBpm}
                    <span
                      className="chip-x"
                      role="button"
                      aria-label="Remove target"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTargetBpm(null);
                        metronome.stop();
                      }}
                    >
                      ✕
                    </span>
                  </>
                ) : (
                  <>
                    <Bullseye /> set a target
                  </>
                )}
              </button>
              {songPlaying && (
                <button className="target-chip" onClick={() => stopPreview()}>
                  ◼ stop song
                </button>
              )}
              <button className="target-chip daily-chip" onClick={() => setDailyOpen(true)}>
                🎵 daily #{day}
                {todayResult ? (
                  <span className="daily-chip-score">
                    {todayResult.skipped ? 'skipped' : `${todayResult.score}/100`}
                  </span>
                ) : (
                  <span className="pulse-dot" aria-hidden="true" />
                )}
              </button>
            </div>
          </>
        )}
      </main>

      <section className="graph-area">
        {challenge ? (
          <div className="graph-empty squiggle">
            <div>
              {clipPlaying ? (
                <>
                  the clip's tempo is scrambled — hearing the song is free,
                  <br />
                  finding its real beat is still on you! (taps pause meanwhile)
                </>
              ) : (
                <>
                  eyes off the screen — trust your inner clock!
                  <br />
                  numbers show up when you're done
                </>
              )}
            </div>
          </div>
        ) : demo.running ? (
          <div className="graph-empty squiggle">
            <div>
              every pulse = one tap — the steady beat, not every word!
              <br />
              hear how “star” holds on while the beat keeps ticking
            </div>
          </div>
        ) : (
          <>
        {points.length === 0 && recorder.volume.length === 0 ? (
          <div className="graph-empty squiggle">
            <div>
              was I rushing? dragging? steady?
              <br />
              your tempo graph shows up here
            </div>
            <svg className="arrow" viewBox="0 0 40 60" aria-hidden="true">
              <path
                d="M8 8 C 28 12, 34 28, 26 50 M26 50 l -2 -10 M26 50 l 10 -5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        ) : (
          <Graph
            points={points}
            targetBpm={targetBpm}
            volume={recorder.volume}
            playbackTime={recorder.playbackTime}
            onSeek={recorder.status === 'playing' ? recorder.seek : null}
          />
        )}
        <div className="stats-row">
          {stats ? (
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
            <span className="stats-placeholder">{hasSession ? 'keep tapping…' : 'stats appear after a few taps'}</span>
          )}
        </div>
          </>
        )}
      </section>

      {!challenge && !demo.running && (
      <>
      <div className="controls-hint squiggle" data-no-tap aria-hidden="true">
        {!hasSession && !metronome.isOn ? (
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
            start a metronome and try to hold its beat
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
          <button className={`btn ${recorder.status === 'playing' ? 'btn-active' : ''}`} onClick={togglePlay}>
            <span className="btn-icon">{recorder.status === 'playing' ? '◼' : '▶'}</span>
            {recorder.status === 'playing' ? 'stop' : 'play'}
          </button>
        )}
        <button
          className="btn"
          onClick={reset}
          disabled={!hasSession && !recorder.hasRecording}
          title="Clear taps and recording"
        >
          <span className="btn-icon">↻</span>
          reset
        </button>
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
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {dailyOpen && (
        <DailySheet
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
          onPracticeAt={(v, previewUrl) => {
            setTargetBpm(v);
            dismissDaily();
            setRunReveal(null);
            setTaps([]);
            if (previewUrl) {
              setSongPlaying(true);
              playPreview(previewUrl, { onDone: () => setSongPlaying(false) });
            }
          }}
          onClose={() => {
            dismissDaily();
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
