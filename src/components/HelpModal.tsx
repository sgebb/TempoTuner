import { clearConsent } from '../lib/analytics';

type Props = { onClose: () => void };

const changeCookieChoice = () => {
  clearConsent();
  window.location.reload();
};

/**
 * Deliberately short — the long-form descriptive copy lives as hidden static
 * content in index.html, where crawlers read it without needing this modal.
 */
const HelpModal = ({ onClose }: Props) => (
  <div className="overlay" onClick={onClose} data-no-tap>
    <div className="sheet help-sheet" onClick={(e) => e.stopPropagation()}>
      <div className="sheet-header">
        <h2>How TempoTuner works</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close help">
          ✕
        </button>
      </div>
      <div className="help-body">
        <p>
          <strong>Tap anywhere</strong> to the beat while you sing or play — the graph shows your
          BPM and exactly where you rushed or dragged.
        </p>
        <p>
          <strong>Set a target</strong> for a guide line and the metronome. <strong>Record</strong>{' '}
          yourself and play it back to hear the moment your timing drifted.
        </p>
        <p>
          <strong>Daily challenge 🎵</strong> — tap a well-known song's beat from memory, get
          scored against its real BPM, build a streak and climb the 🏆 leaderboard.
        </p>
        <p>
          <strong>Install it</strong> — <em>Add to Home Screen</em> in your browser menu makes it a
          full-screen app that works offline.
        </p>
        <p>
          <strong>Privacy</strong> — taps and recordings never leave your device. The leaderboard
          stores only your nickname and scores (no account); analytics only if you said yes to
          cookies.{' '}
          <button className="linklike" onClick={changeCookieChoice}>
            Change cookie choice
          </button>
        </p>
      </div>
    </div>
  </div>
);

export default HelpModal;
