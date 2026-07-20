import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Graph from './components/Graph';
import { Bullseye, MetronomeMark } from './components/icons';
import HelpModal from './components/HelpModal';
import TargetSheet from './components/TargetSheet';
import ShareSheet from './components/ShareSheet';
import { useMetronome } from './hooks/useMetronome';
import { useRecorder } from './hooks/useRecorder';
import { accuracyColor, computeStats, currentBpm, driftLabel, tapsToPoints } from './lib/tempo';

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

  const metronome = useMetronome();
  const recorder = useRecorder();

  const points = useMemo(() => tapsToPoints(taps), [taps]);
  const bpm = useMemo(() => currentBpm(points), [points]);
  const stats = useMemo(() => computeStats(points), [points]);

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
    setTaps((prev) => [...prev, performance.now()]);
    const id = ++rippleId.current;
    setRipples((prev) => [...prev.slice(-6), { id, x, y }]);
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 700);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    if (target.closest('button, input, textarea, a, [data-no-tap]')) return;
    registerTap(e.clientX, e.clientY);
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
    <div className="app" onPointerDown={handlePointerDown}>
      <header className="topbar" data-no-tap>
        <h1 className="logo">
          <MetronomeMark />
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
        {recorder.hasRecording && (
          <span className="graph-hint squiggle" data-no-tap>
            tap the graph to hear that part ↓
          </span>
        )}
        {points.length === 0 && recorder.volume.length === 0 ? (
          <div className="graph-empty squiggle">
            <svg className="arrow" viewBox="0 0 60 40" aria-hidden="true">
              <path
                d="M50 5 C 30 2, 12 12, 10 30 M10 30 l -4 -9 M10 30 l 9 -3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            your tempo graph shows up here — was I rushing? dragging? steady?
          </div>
        ) : (
          <Graph
            points={points}
            targetBpm={targetBpm}
            volume={recorder.volume}
            playbackTime={recorder.playbackTime}
            onSeek={recorder.hasRecording ? recorder.seek : null}
          />
        )}
        <div className="stats-row">
          {stats ? (
            <>
              <span>
                avg <strong>{stats.avg}</strong>
              </span>
              <span>
                steady <strong>{stats.stability}%</strong>
              </span>
              <span>
                trend <strong>{driftLabel(stats.drift)}</strong>
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
        <button className="btn" onClick={reset} disabled={!hasSession && !recorder.hasRecording}>
          <span className="btn-icon">↻</span>
          reset
        </button>
        <button className="btn" onClick={() => setShareOpen(true)} disabled={!stats}>
          <span className="btn-icon">⇱</span>
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
