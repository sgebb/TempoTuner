type Props = { onClose: () => void };

/**
 * Deliberately short — the long-form descriptive copy lives as hidden static
 * content in index.html, where crawlers read it without needing this modal.
 */
const HelpModal = ({ onClose }: Props) => (
  <div className="overlay overlay-center" onClick={onClose} data-no-tap>
    <div className="sheet help-sheet" onClick={(e) => e.stopPropagation()}>
      <div className="sheet-header">
        <h2>What is TempoTuner?</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close help">
          ✕
        </button>
      </div>
      <div className="help-body">
        <p>
          <strong>A daily song tempo game 🎵</strong> Every day there's one well-known song. Sing it
          in your head and tap its beat from memory — 16 taps. You're scored on how close you got to
          its real BPM, and on how steady you held it.
        </p>
        <p>
          <strong>One shot a day.</strong> Your first full run counts for the 🏆 leaderboard and your
          🔥 streak. After that you can replay it as often as you like — replays never count.
        </p>
        <p>
          <strong>Leaderboards 🏆</strong> Join with just a nickname (no account) to see where you
          rank today and all-time.
        </p>
        <p>
          <strong>Missed a day? 📅</strong> Open the calendar to see every past song and its top
          scores, and play the ones you missed (saved on your device only).
        </p>
        <p>
          <strong>Practice mode 🥁</strong> Tap anywhere to the beat while you sing or play — the
          graph shows exactly where you rushed or dragged. Set a target for a metronome, and record
          yourself to hear where your timing drifted.
        </p>
        <p>
          <strong>Install it</strong>: <em>Add to Home Screen</em> in your browser menu makes it a
          full-screen app.
        </p>
        <p>
          <strong>Privacy</strong>: Taps and recordings never leave your device. The leaderboard
          stores only your nickname and scores. Visits are counted anonymously — no cookies, no
          tracking.
        </p>
      </div>
    </div>
  </div>
);

export default HelpModal;
