import { clearConsent } from '../lib/analytics';

type Props = { open: boolean; onClose: () => void };

const changeCookieChoice = () => {
  clearConsent();
  window.location.reload();
};

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
          metronome. Practice with it clicking, or turn it off after a few beats and see how steady
          you stay on your own.
        </p>
        <p>
          <strong>Record</strong> your voice while you tap, then play it back: a playhead moves along
          the graph so you can hear the exact moment your timing drifted.
        </p>
        <p>
          <strong>Share</strong> your daily challenge result as an image — score, streak and your
          tempo graph — and <strong>reset</strong> (↻) clears taps and recording but keeps your
          target.
        </p>
        <p>
          <strong>Daily challenge</strong> — every day there's one well-known song. Sing it in your
          head and tap its <em>main beat</em> from memory — the steady pulse you'd clap along to,
          not every word — and see how close you got to the real BPM. Unsure what to tap? The demo
          plays Twinkle Twinkle Little Star and pulses exactly where the taps go. Build a streak
          and share your score — it's ear training disguised as a game.
        </p>
        <p>
          <strong>Install it</strong> — TempoTuner works as an app on your phone: open your
          browser menu and choose <em>Add to Home Screen</em> (or <em>Install</em>). It launches
          full-screen from its own icon and works offline.
        </p>
        <h3>Why train tempo?</h3>
        <p>
          Keeping steady time is one of the hardest skills for singers and musicians practicing
          without a backing track. TempoTuner is a free online tap-tempo trainer and rhythm
          consistency checker: a beat keeper that works in your browser, on any phone, with no
          install and no account. Everything stays on your device — nothing is uploaded.
        </p>
        <p>
          <strong>Privacy</strong> — taps and recordings never leave your device. If you said yes
          to the cookie question, we count visits anonymously with Google Analytics — nothing more.
          If you join the daily leaderboard, your chosen nickname and daily scores are stored on
          our server (no email, no account); everything else stays local.{' '}
          <button className="linklike" onClick={changeCookieChoice}>
            Change cookie choice
          </button>
        </p>
      </div>
    </div>
  </div>
);

export default HelpModal;
