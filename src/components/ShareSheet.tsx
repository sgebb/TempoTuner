import { useState } from 'react';
import { Stats, TapPoint } from '../lib/tempo';
import { renderShareImage, shareOrDownload } from '../lib/shareImage';

type Props = {
  points: TapPoint[];
  stats: Stats | null;
  targetBpm: number | null;
  dark: boolean;
  onClose: () => void;
};

const ShareSheet = ({ points, stats, targetBpm, dark, onClose }: Props) => {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const doShare = async () => {
    setBusy(true);
    try {
      const blob = await renderShareImage({ message, points, stats, targetBpm, dark });
      await shareOrDownload(blob, message);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose} data-no-tap>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>Share your session</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <textarea
          className="share-message"
          placeholder="What were you singing? How did it go?"
          maxLength={140}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
        />
        <p className="sheet-hint">Your note, stats and graph become one image you can share anywhere.</p>
        {stats && (
          <p className="sheet-hint">
            Coach's note on the image: <em>“{stats.comment}”</em>
          </p>
        )}
        <div className="sheet-actions">
          <button className="btn btn-primary" onClick={doShare} disabled={busy}>
            {busy ? 'Creating image…' : 'Share as image'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareSheet;
