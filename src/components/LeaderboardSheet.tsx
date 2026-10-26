import { Fragment, useCallback, useEffect, useState } from 'react';
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
  /** showing a past day's board (opened from the calendar) rather than today's */
  past?: boolean;
  todayResult: DailyResult | undefined;
  onClose: () => void;
};

const MEDALS = ['🥇', '🥈', '🥉'];
const rankBadge = (rank: number) => MEDALS[rank - 1] ?? `${rank}.`;
const DEFAULT_ALL_TIME_RULES = { attemptWindow: 20, scoresCounted: 15, minimumGames: 8 };

const LeaderboardSheet = ({ todayKey, day, past = false, todayResult, onClose }: Props) => {
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

  const allTimeRules = data?.allTimeRules ?? DEFAULT_ALL_TIME_RULES;
  const pendingAllTime = data?.you && !data.you.eligible ? data.you : null;
  const pendingRank = pendingAllTime?.allTimeRank;
  const pendingInsertIndex =
    pendingRank === null || pendingRank === undefined ? -1 : (data?.allTime.findIndex((entry) => entry.rank >= pendingRank) ?? -1);

  return (
    <div className="overlay overlay-center" data-no-tap>
      <div className="sheet">
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
                <p className="sheet-hint">{past ? 'Nobody on the board that day.' : 'No scores yet today — be the first!'}</p>
              ) : (
                <ol className="lb-list">
                  {data.today.map((e, i) => (
                    <li key={i} className={`lb-row ${e.you ? 'lb-you' : ''}`}>
                      <span className="lb-rank">{rankBadge(i + 1)}</span>
                      <span className="lb-nick">{e.nickname}</span>
                      <span className="lb-score">{e.score}</span>
                    </li>
                  ))}
                </ol>
              )
            ) : (
              <>
                <p className="sheet-hint lb-rules">
                  Best {allTimeRules.scoresCounted} scores from your latest {allTimeRules.attemptWindow} tries ·{' '}
                  {allTimeRules.minimumGames} tries to qualify
                </p>
                {data.allTime.length === 0 && !pendingAllTime ? (
                  <p className="sheet-hint">Nobody on the all-time board yet.</p>
                ) : (
                  <ol className="lb-list">
                    {data.allTime.map((e, i) => (
                      <Fragment key={i}>
                        {pendingAllTime && pendingInsertIndex === i && (
                          <li key="pending" className="lb-row lb-pending">
                            <span className="lb-rank">#{pendingRank}</span>
                            <span className="lb-nick">
                              you <span className="lb-games">· {pendingAllTime.games} played</span>
                            </span>
                            <span className="lb-score">{pendingAllTime.total}</span>
                          </li>
                        )}
                        <li className={`lb-row ${e.you ? 'lb-you' : ''}`}>
                          <span className="lb-rank">{rankBadge(e.rank ?? i + 1)}</span>
                          <span className="lb-nick">
                            {e.nickname} <span className="lb-games">· {e.games} played</span>
                          </span>
                          <span className="lb-score">{e.total}</span>
                        </li>
                      </Fragment>
                    ))}
                    {pendingAllTime && pendingInsertIndex < 0 && (
                      <li className="lb-row lb-pending">
                        <span className="lb-rank">
                          {pendingAllTime.allTimeRank === null ? '—' : `#${pendingAllTime.allTimeRank}`}
                        </span>
                        <span className="lb-nick">
                          you <span className="lb-games">· {pendingAllTime.games} played</span>
                        </span>
                        <span className="lb-score">{pendingAllTime.total}</span>
                      </li>
                    )}
                  </ol>
                )}
                {pendingAllTime && (
                  <p className="sheet-hint lb-pending-note">
                    You'd be #{pendingAllTime.allTimeRank ?? '—'} — not on the all-time board yet. Play{' '}
                    {allTimeRules.minimumGames - pendingAllTime.games} more{' '}
                    {allTimeRules.minimumGames - pendingAllTime.games === 1 ? 'daily' : 'dailies'} to qualify.
                  </p>
                )}
              </>
            )}

            {data?.you &&
              (tab === 'today' ? data.you.todayRank !== null : data.you.eligible && data.you.allTimeRank !== null) && (
              <p className="sheet-hint lb-you-line">
                {tab === 'today'
                  ? data.you.todayRank !== null
                    ? `you're #${data.you.todayRank} ${past ? 'that day' : 'today'}`
                    : "you haven't played today"
                  : data.you.allTimeRank !== null
                    ? `you're #${data.you.allTimeRank} all-time · ${data.you.total} pts from your best ${allTimeRules.scoresCounted} of the latest ${allTimeRules.attemptWindow} tries`
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
