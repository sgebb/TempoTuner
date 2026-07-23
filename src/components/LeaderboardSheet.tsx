import { useCallback, useEffect, useState } from 'react';
import { DailyResult } from '../lib/daily';
import {
  LeaderboardData,
  apiConfigured,
  fetchLeaderboard,
  getNickname,
  maybeSubmitToday,
  saveNickname,
} from '../lib/leaderboard';

type Props = {
  todayKey: string;
  day: number;
  todayResult: DailyResult | undefined;
  onClose: () => void;
};

const MEDALS = ['🥇', '🥈', '🥉'];
const rankBadge = (i: number) => MEDALS[i] ?? `${i + 1}.`;

const LeaderboardSheet = ({ todayKey, day, todayResult, onClose }: Props) => {
  const [tab, setTab] = useState<'today' | 'alltime'>('today');
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [error, setError] = useState(false);
  const [joined, setJoined] = useState(() => getNickname() !== null);
  const [editing, setEditing] = useState(false);
  const [nickDraft, setNickDraft] = useState(() => getNickname() ?? '');

  const load = useCallback(async () => {
    setError(false);
    setData(null);
    try {
      await maybeSubmitToday(todayKey, todayResult).catch(() => undefined);
      setData(await fetchLeaderboard(todayKey));
    } catch {
      setError(true);
    }
  }, [todayKey, todayResult]);

  useEffect(() => {
    if (apiConfigured()) load();
  }, [load]);

  const join = () => {
    const nick = nickDraft.trim();
    if (nick.length < 2) return;
    saveNickname(nick);
    setJoined(true);
    setEditing(false);
    load();
  };

  return (
    <div className="overlay overlay-center" onClick={onClose} data-no-tap>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>🏆 Leaderboard</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {!apiConfigured() ? (
          <p className="sheet-hint">The leaderboard isn't live yet — check back soon!</p>
        ) : !joined || editing ? (
          <>
            <p className="sheet-hint">
              {joined
                ? 'Pick a new nickname — it applies from your next daily.'
                : 'Join with a nickname — no account, no email. Your daily scores appear under this name.'}
            </p>
            <div className="lb-join">
              <input
                className="nick-input"
                type="text"
                placeholder="nickname"
                maxLength={20}
                value={nickDraft}
                onChange={(e) => setNickDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && join()}
              />
              <button className="btn btn-primary" onClick={join} disabled={nickDraft.trim().length < 2}>
                {joined ? 'Save' : 'Join'}
              </button>
            </div>
            {!joined && data && <p className="sheet-hint">…or just peek below 👇</p>}
          </>
        ) : (
          <p className="sheet-hint lb-playing-as">
            playing as <strong>{getNickname()}</strong>{' '}
            <button className="linklike" onClick={() => setEditing(true)}>
              change
            </button>
          </p>
        )}

        {apiConfigured() && (
          <>
            <div className="preset-row">
              <button className={`chip ${tab === 'today' ? 'chip-active' : ''}`} onClick={() => setTab('today')}>
                Daily #{day}
              </button>
              <button className={`chip ${tab === 'alltime' ? 'chip-active' : ''}`} onClick={() => setTab('alltime')}>
                All-time
              </button>
            </div>

            {error ? (
              <p className="sheet-hint">
                Couldn't reach the leaderboard.{' '}
                <button className="linklike" onClick={load}>
                  Try again
                </button>
              </p>
            ) : !data ? (
              <p className="sheet-hint">loading…</p>
            ) : tab === 'today' ? (
              data.today.length === 0 ? (
                <p className="sheet-hint">No scores yet today — be the first!</p>
              ) : (
                <ol className="lb-list">
                  {data.today.map((e, i) => (
                    <li key={i} className={`lb-row ${e.you ? 'lb-you' : ''}`}>
                      <span className="lb-rank">{rankBadge(i)}</span>
                      <span className="lb-nick">{e.nickname}</span>
                      <span className="lb-score">{e.score}</span>
                    </li>
                  ))}
                </ol>
              )
            ) : data.allTime.length === 0 ? (
              <p className="sheet-hint">Nobody on the all-time board yet.</p>
            ) : (
              <ol className="lb-list">
                {data.allTime.map((e, i) => (
                  <li key={i} className={`lb-row ${e.you ? 'lb-you' : ''}`}>
                    <span className="lb-rank">{rankBadge(i)}</span>
                    <span className="lb-nick">
                      {e.nickname} <span className="lb-games">· {e.games} played</span>
                    </span>
                    <span className="lb-score">{e.total}</span>
                  </li>
                ))}
              </ol>
            )}

            {data?.you && (data.you.todayRank ?? data.you.allTimeRank) !== null && (
              <p className="sheet-hint lb-you-line">
                {tab === 'today'
                  ? data.you.todayRank !== null
                    ? `you're #${data.you.todayRank} today`
                    : "you haven't played today"
                  : data.you.allTimeRank !== null
                    ? `you're #${data.you.allTimeRank} all-time · ${data.you.total} pts over ${data.you.games} ${data.you.games === 1 ? 'game' : 'games'}`
                    : ''}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LeaderboardSheet;
