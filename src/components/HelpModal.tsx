type Props = { open: boolean; onClose: () => void };

/**
 * Kept mounted (hidden) even when closed so the descriptive text is always in
 * the DOM — it's the main crawlable content of the app.
 */
const HelpModal = ({ open, onClose }: Props) => (
  <div
    className="overlay"
    style={{ display: open ? undefined : 'none' }}
    aria-hidden={!open}
    onClick={onClose}
    data-no-tap
  >
    <div className="sheet help-sheet" onClick={(e) => e.stopPropagation()}>
      <div className="sheet-header">
        <h2>How TempoTuner works</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close help">
          ✕
        </button>
      </div>
      <div className="help-body">
        <p>
          <strong>Tap anywhere</strong> to the beat — while singing, drumming or playing. TempoTuner
          measures your tempo in BPM on every tap and draws it on the graph, so you can see exactly
          where you rushed or slowed down.
        </p>
        <p>
          <strong>Set a target BPM</strong> to get a dashed target line on the graph and unlock the
          metronome. The metronome counts you in, then <em>fades out slowly</em> — keep going on your
          own and see how steady you stayed.
        </p>
        <p>
          <strong>Record</strong> your voice while you tap, then play it back: a playhead moves along
          the graph so you can hear the exact moment your timing drifted.
        </p>
        <p>
          <strong>Share</strong> exports your session — stats and graph — as an image with your own
          note, and <strong>reset</strong> clears taps and recording but keeps your target.
        </p>
        <h3>Why train tempo?</h3>
        <p>
          Keeping steady time is one of the hardest skills for singers and musicians practicing
          without a backing track. TempoTuner is a free online tap-tempo trainer and rhythm
          consistency checker: a beat keeper that works in your browser, on any phone, with no
          install and no account. Everything stays on your device — nothing is uploaded.
        </p>
      </div>
    </div>
  </div>
);

export default HelpModal;
