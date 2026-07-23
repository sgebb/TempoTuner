import { useState } from 'react';
import { MAX_BPM, MIN_BPM } from '../lib/tempo';
import { Bullseye } from './icons';

type Props = {
  targetBpm: number | null;
  averageBpm: number | null;
  onSet: (bpm: number | null) => void;
  onClose: () => void;
};

const TargetSheet = ({ targetBpm, averageBpm, onSet, onClose }: Props) => {
  const [value, setValue] = useState(targetBpm ?? averageBpm ?? 100);

  const clamp = (v: number) => Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(v)));

  const apply = (v: number | null) => {
    onSet(v === null ? null : clamp(v));
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose} data-no-tap>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>
            <Bullseye size={17} /> Target BPM
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="target-value-row">
          <button className="step-btn" onClick={() => setValue((v) => clamp(v - 1))} aria-label="Decrease BPM">
            −
          </button>
          <span className="target-value">{value}</span>
          <button className="step-btn" onClick={() => setValue((v) => clamp(v + 1))} aria-label="Increase BPM">
            +
          </button>
        </div>
        <input
          type="range"
          min={MIN_BPM}
          max={MAX_BPM}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          aria-label="Target BPM slider"
        />
        {averageBpm !== null && (
          <div className="preset-row">
            <button className="chip" onClick={() => setValue(clamp(averageBpm))}>
              use my average ({averageBpm})
            </button>
          </div>
        )}
        <p className="sheet-hint">
          Sets the dashed line on the graph, and the metronome clicks at this tempo.
        </p>
        <div className="sheet-actions">
          {targetBpm !== null && (
            <button className="btn btn-ghost" onClick={() => apply(null)}>
              Remove target
            </button>
          )}
          <button className="btn btn-primary" onClick={() => apply(value)}>
            Set target
          </button>
        </div>
      </div>
    </div>
  );
};

export default TargetSheet;
