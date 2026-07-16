import React, { useEffect, useMemo, useRef, useState } from 'react';

type Point = {
  bpm: number;
  diff: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getAccuracyColor = (diff: number) => {
  if (Math.abs(diff) <= 2) return '#34d399';
  if (Math.abs(diff) <= 6) return '#fbbf24';
  return '#f87171';
};

const App = () => {
  const [targetBpm, setTargetBpm] = useState(100);
  const [points, setPoints] = useState<Point[]>([]);
  const [useTarget, setUseTarget] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [tooltip, setTooltip] = useState<null | { x: number; y: number; bpm: number; index: number }>(null);
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [statusText, setStatusText] = useState('Tap to begin');
  const [averageBpm, setAverageBpm] = useState(0);
  const [currentBpm, setCurrentBpm] = useState(0);
  const [deviation, setDeviation] = useState(0);

  const displayBpm = currentBpm > 0 ? currentBpm : targetBpm;
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const dialRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);
  const lastTapRef = useRef<number | null>(null);

  const updateStats = (recentPoints: Point[]) => {
    if (!recentPoints.length) {
      setAverageBpm(0);
      setCurrentBpm(0);
      setDeviation(0);
      return;
    }
    const avg = recentPoints.reduce((sum, point) => sum + point.bpm, 0) / recentPoints.length;
    const latest = recentPoints[recentPoints.length - 1];
    const diff = latest.bpm - targetBpm;
    setAverageBpm(Math.round(avg));
    setCurrentBpm(Math.round(latest.bpm));
    setDeviation(Math.round(diff));
  };

  useEffect(() => {
    updateStats(points);
  }, [points, targetBpm]);

  const stopMetronome = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    if (audioContextRef.current) {
      const ctx = audioContextRef.current;
      if (ctx.state !== 'closed') {
        ctx.suspend().catch(() => undefined);
      }
    }
    oscillatorRef.current?.stop();
    oscillatorRef.current = null;
    gainRef.current = null;
    timerRef.current = null;
    fadeTimerRef.current = null;
    setIsMetronomeOn(false);
    setIsFadingOut(false);
  };

  useEffect(() => {
    return () => stopMetronome();
  }, []);

  const startMetronome = () => {
    // Use the Web Audio API to generate a steady click without needing any backend.
    stopMetronome();
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      setStatusText('Audio not supported in this browser');
      return;
    }
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioCtx();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.0001;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillatorRef.current = oscillator;
    gainRef.current = gain;

    const tick = () => {
      if (!gainRef.current) return;
      gainRef.current.gain.cancelScheduledValues(ctx.currentTime);
      gainRef.current.gain.setValueAtTime(0.0001, ctx.currentTime);
      gainRef.current.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.01);
      gainRef.current.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
    };

    tick();
    timerRef.current = window.setInterval(tick, 60000 / targetBpm);
    setIsMetronomeOn(true);
    setIsFadingOut(false);
    setStatusText(`Metronome at ${targetBpm} BPM`);
  };

  const fadeOut = (duration = 1500) => {
    const ctx = audioContextRef.current;
    if (!gainRef.current || !ctx) return;
    gainRef.current.gain.cancelScheduledValues(ctx.currentTime);
    gainRef.current.gain.setValueAtTime(gainRef.current.gain.value || 0.08, ctx.currentTime);
    gainRef.current.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + duration / 1000);
    if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = window.setTimeout(() => {
      stopMetronome();
      setStatusText('Metronome faded out');
    }, duration + 50);
    setIsFadingOut(true);
  };

  const toggleMetronome = () => {
    if (isMetronomeOn) {
      stopMetronome();
      setStatusText('Metronome stopped');
      return;
    }
    startMetronome();
  };

  useEffect(() => {
    if (isMetronomeOn && !isFadingOut) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (audioContextRef.current) {
        startMetronome();
      }
    }
  }, [targetBpm]);

  useEffect(() => {
    if (!isMetronomeOn) return;
    if (isFadingOut) {
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = window.setTimeout(() => {
        stopMetronome();
        setStatusText('Metronome faded out');
      }, 4000);
    }
  }, [isFadingOut]);

  const handleTap = () => {
    const now = performance.now();
    const previousTap = lastTapRef.current;
    lastTapRef.current = now;

    if (previousTap !== null) {
      const interval = now - previousTap;
      const tapBpm = Math.round(60000 / interval);
      const clampedBpm = clamp(tapBpm, 40, 220);
      const targetDiff = clampedBpm - targetBpm;
      const nextPoint = { bpm: clampedBpm, diff: targetDiff };

      setPoints((prev) => {
        const updated = [...prev, nextPoint].slice(-12);
        updateStats(updated);
        return updated;
      });
      setStatusText(`${clampedBpm} BPM • ${Math.abs(targetDiff)} BPM ${targetDiff >= 0 ? 'above' : 'below'} target`);
      // fade metronome quickly when user starts tapping so it doesn't interfere
      if (isMetronomeOn) fadeOut(1500);
    } else {
      setStatusText('First tap recorded');
    }
  };

  const resetSession = () => {
    setPoints([]);
    setAverageBpm(0);
    setCurrentBpm(0);
    setDeviation(0);
    lastTapRef.current = null;
    setStatusText('Session reset');
  };

  const handleTargetChange = (value: number) => {
    setTargetBpm(value);
    if (isMetronomeOn) fadeOut(4000);
  };

  // Dial pointer handlers
  const handleDialPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    handleDialPointerMove(e);
  };
  const handleDialPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !dialRef.current) return;
    const rect = dialRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx); // -PI..PI
    // convert so 0 is top and range is 0..360 clockwise
    let deg = (angle * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    const fraction = deg / 360;
    const bpm = Math.round(40 + fraction * (220 - 40));
    setTargetBpm(bpm);
  };
  const handleDialPointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {}
    if (isMetronomeOn) fadeOut(4000);
  };

  const graphWidth = 320;
  const graphHeight = 180;
  const padding = 20;
  const maxBpm = 220;
  const minBpm = 40;

  const pointsForChart = useMemo(() => {
    const safePoints = points.length > 0 ? points : [{ bpm: targetBpm, diff: 0 }];
    return safePoints.map((point, index) => {
      const x = padding + (index / Math.max(1, safePoints.length - 1)) * (graphWidth - padding * 2);
      const y = padding + ((maxBpm - point.bpm) / (maxBpm - minBpm)) * (graphHeight - padding * 2);
      return { x, y, color: getAccuracyColor(point.diff), bpm: point.bpm };
    });
  }, [points, targetBpm]);

  const targetY = padding + ((maxBpm - targetBpm) / (maxBpm - minBpm)) * (graphHeight - padding * 2);

  useEffect(() => {
    document.documentElement.classList.toggle('dark-theme', isDark);
  }, [isDark]);

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Metronome app • beat practice tool</p>
          <h1>TempoTuner</h1>
          <p className="hero-copy">Train rhythm, beat, and timing with a fast metronome app for singers, musicians, and practice sessions.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ghost-button" onClick={() => setIsDark((s) => !s)}>{isDark ? 'Light' : 'Dark'}</button>
          <button className="ghost-button" onClick={resetSession}>New session</button>
        </div>
      </header>

      <section className="meter-card">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div className="bpm-stack">
          <p className="status">{statusText}</p>
          <div className="bpm-display" style={{ color: currentBpm > 0 && useTarget ? getAccuracyColor(currentBpm - targetBpm) : undefined }}>{displayBpm}</div>
          <div className="bpm-label">Current BPM</div>
        </div>

          <div className="dial-wrap">
            <svg ref={dialRef} className="dial" viewBox="0 0 120 120" onPointerDown={handleDialPointerDown} onPointerMove={handleDialPointerMove} onPointerUp={handleDialPointerUp}>
              <circle cx="60" cy="60" r="50" fill="var(--dial-bg)" stroke="rgba(0,0,0,0.08)" />
              <g className="dial-knob" style={{ transform: `rotate(${((targetBpm - 40) / (220 - 40)) * 360}deg)`, transformOrigin: '60px 60px' }}>
                <rect x="58" y="10" width="4" height="28" rx="2" fill="var(--accent)" />
              </g>
              <text x="50%" y="68%" textAnchor="middle" fontSize="14" fill="var(--dial-text)" fontWeight="700">{targetBpm}</text>
            </svg>

            {points.length === 0 && (
              <div className="scribble-hint">
                <div className="scribble">turn to set target bpm</div>
                <div className="scribble-arrow">➜</div>
              </div>
            )}
          </div>

        <button className="tap-button" onPointerDown={handleTap}>
          Tap beat
        </button>

        <div className="stats-grid">
          <div>
            <span className="stat-label">Average</span>
            <strong>{averageBpm || '--'}</strong>
          </div>
          <div>
            <span className="stat-label">Target diff</span>
            <strong>{deviation ? `${deviation > 0 ? '+' : ''}${deviation}` : '--'}</strong>
          </div>
          <div>
            <span className="stat-label">Stability</span>
            <strong>{points.length > 1 ? `${Math.max(0, 100 - Math.abs(deviation) * 3)}%` : '--'}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Tempo control</h2>
          <button className="ghost-button" onClick={toggleMetronome}>
            {isMetronomeOn ? 'Stop' : 'Start'}
          </button>
        </div>

        <label className="slider-row" htmlFor="target-bpm">
          <span>Target BPM: {targetBpm}</span>
          <input
            id="target-bpm"
            type="range"
            min="40"
            max="220"
            value={targetBpm}
            onChange={(event) => handleTargetChange(Number(event.target.value))}
            onPointerUp={() => setIsFadingOut(true)}
            onPointerLeave={() => setIsFadingOut(true)}
          />
        </label>
        <p className="helper">Drag to set a target tempo, then let the metronome fade out after a few seconds.</p>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Tempo graph</h2>
          <span className="pill">Live</span>
        </div>
        <div className="graph-wrap" style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${graphWidth} ${graphHeight}`} className="graph" role="img" aria-label="Tempo graph showing your measured BPM against the target line">
          {useTarget && <line x1={padding} y1={targetY} x2={graphWidth - padding} y2={targetY} stroke="var(--accent)" strokeDasharray="4 4" />}
          <line x1={padding} y1={padding} x2={padding} y2={graphHeight - padding} stroke="rgba(255,255,255,0.18)" />
          <line x1={padding} y1={graphHeight - padding} x2={graphWidth - padding} y2={graphHeight - padding} stroke="rgba(255,255,255,0.18)" />
          <path
            d={pointsForChart.reduce((path, point, index) => {
              return `${path}${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)} `;
            }, '')}
            fill="none"
            stroke="url(#graph-gradient)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="graph-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f87171" />
            </linearGradient>
          </defs>
          {pointsForChart.map((point, index) => (
            <circle
              key={`${point.x}-${point.y}-${index}`}
              cx={point.x}
              cy={point.y}
              r="6"
              fill={point.color}
              onPointerEnter={(e) => {
                const rect = (e.currentTarget as Element).closest('.graph')?.getBoundingClientRect();
                if (rect) setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, bpm: (point as any).bpm, index });
              }}
              onPointerLeave={() => setTooltip(null)}
              onClick={(e) => {
                const rect = (e.currentTarget as Element).closest('.graph')?.getBoundingClientRect();
                if (rect) setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, bpm: (point as any).bpm, index });
              }}
            />
          ))}
        </svg>
        {tooltip && (
          <div className="graph-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
            <div>{tooltip.bpm} BPM</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Point #{tooltip.index + 1}</div>
          </div>
        )}
        </div>
      </section>

      <section className="panel compact">
        <div className="panel-header">
          <h2>Record</h2>
          <span className="pill muted">Coming soon</span>
        </div>
        <button className="record-button" disabled>Record session</button>
      </section>

      <section className="panel compact">
        <div className="panel-header">
          <h2>Session history</h2>
          <span className="pill muted">Coming soon</span>
        </div>
        <p className="helper">Saved sessions and streaks will appear here in a future update.</p>
      </section>

      <section className="panel compact">
        <h2>About</h2>
        <p>
          TempoTuner is a rhythm practice tool for singers and musicians who want to build steady timing, improve beat accuracy, and keep tempo without distractions.
        </p>
      </section>

      <section className="panel info-page">
        <div className="panel-header">
          <h2>How to use</h2>
        </div>
        <p>Turn the dial to set the target BPM, then tap along to the beat. The center number updates with your last tap and turns green when you’re close to target.</p>
        <p>The graph updates automatically, and you can hover or tap the bubbles to see each measurement.</p>
        <div className="panel-header" style={{ marginTop: '1rem' }}>
          <h2>Who made it</h2>
        </div>
        <p>Built by a musician-friendly developer team with a focus on fast, playful tempo practice.</p>
        <div className="panel-header" style={{ marginTop: '1rem' }}>
          <h2>Privacy</h2>
        </div>
        <p>No data is sent out. TempoTuner works entirely in your browser, so your tap history stays local and private.</p>
      </section>
    </div>
  );
};

export default App;
