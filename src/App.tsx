import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Graph from './components/Graph';
import { Bullseye, MetronomeMark, ShareNodes } from './components/icons';
import HelpModal from './components/HelpModal';
import TargetSheet from './components/TargetSheet';
import ShareSheet from './components/ShareSheet';
import { useMetronome } from './hooks/useMetronome';
import { useRecorder } from './hooks/useRecorder';
import { accuracyColor, computeStats, currentBpm, tapsToPoints } from './lib/tempo';

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
  const [shareOpen, setShareOpen] = useState(false);
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

  const points = useMemo(() => tapsToPoints(taps), [taps]);
  const bpm = useMemo(() => currentBpm(points), [points]);
  const stats = useMemo(() => computeStats(points, targetBpm), [points, targetBpm]);

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

  const registerTap = useCallback((x: number, y: number) => {
    const tapTime = performance.now();
    setTaps((prev) => [...prev, tapTime]);
    const id = ++rippleId.current;
    setRipples((prev) => [...prev.slice(-6), { id, x, y }]);
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 700);
    return { tapTime, rippleId: id };
  }, []);

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
    if (recorder.status === 'playing') return;
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
      const target = e.target as Element;
      if (target.closest('button, input, textarea, [data-no-tap]')) return;
      e.preventDefault();
      registerTap(window.innerWidth / 2, window.innerHeight / 2);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [registerTap]);

  const reset = () => {
    setTaps([]);
    recorder.clear();
    metronome.stop();
  };

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

      <p className="squiggle tagline">sing something &amp; tap anywhere to the beat!</p>

      <main className="bpm-zone">
        <div className={`bpm-big ${bpm !== null ? '' : 'bpm-empty'}`} style={{ color: bpmColor }} key={taps.length}>
          {bpm ?? '· ·'}
        </div>
        <div className="bpm-label">BPM</div>
        <button className="target-chip" data-no-tap onClick={() => setTargetOpen(true)}>
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
      </main>

      <section className="graph-area">
        <button
          className="icon-btn graph-reset"
          data-no-tap
          onClick={reset}
          disabled={!hasSession && !recorder.hasRecording}
          aria-label="Reset session"
          title="Clear taps and recording"
        >
          ↻
        </button>
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
      </section>

      <nav className="controls" data-no-tap>
        <button
          className={`btn ${metronome.isOn ? 'btn-active' : ''}`}
          onClick={toggleMetronome}
          title={
            targetBpm === null
              ? 'Pick a target tempo for the metronome'
              : 'Metronome counts you in, then fades out'
          }
        >
          <span className="btn-icon">{metronome.isOn ? '◼' : '♪'}</span>
          {metronome.isOn ? 'fading…' : 'metronome'}
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
        <button className="btn" onClick={() => setShareOpen(true)} disabled={!stats}>
          <span className="btn-icon">
            <ShareNodes />
          </span>
          share
        </button>
      </nav>

      {recorder.status === 'denied' && (
        <div className="toast" data-no-tap>
          Microphone blocked — allow mic access to record.
        </div>
      )}

      {ripples.map((r) => (
        <span key={r.id} className="ripple" style={{ left: r.x, top: r.y }} aria-hidden="true" />
      ))}

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
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
      {shareOpen && (
        <ShareSheet
          points={points}
          stats={stats}
          targetBpm={targetBpm}
          dark={dark}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
