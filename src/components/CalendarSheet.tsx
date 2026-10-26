import { useEffect, useRef, useState } from 'react';
import { DailyResults, dailyNumber, localDateKey } from '../lib/daily';
import {
  DailyInfo,
  LeaderboardEntry,
  apiConfigured,
  fetchDaily,
  fetchLeaderboard,
} from '../lib/leaderboard';

type Props = {
  results: DailyResults;
  todayKey: string;
  /** the day whose details are open — kept by the app so reopening the
   *  calendar (e.g. after replaying that day) lands right back on it */
  selected: string;
  onSelect: (dayKey: string) => void;
  onClose: () => void;
  onStartDaily: () => Promise<void>;
  /** play a missed (closed) day — throws Error('open') if the day can still
   *  be scored somewhere on Earth */
  onStartArchive: (dayKey: string) => Promise<void>;
  onStartPractice: (
    title: string,
    artist: string,
    bpm: number,
    archive?: { key: string; number: number } | null
  ) => void;
  /** open a day's full leaderboard — offered only for days you've played */
  onLeaderboard: (dayKey: string) => void;
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const MEDALS = ['🥇', '🥈', '🥉'];
const TOP_SHOWN = 3;

// Session caches: a closed day's song and board never change, and browsing
// back and forth shouldn't refetch (the leaderboard endpoint is rate-limited).
// Today's board is still moving, so it's refetched every time.
const infoCache = new Map<string, DailyInfo>();
const boardCache = new Map<string, LeaderboardEntry[]>();

/**
 * One cell per date. Grey = not out (pre-launch or future), green = played on
 * the day, yellow = made up later, red = missed. Any released day can be
 * tapped to see its song and scores in the panel below.
 */
const ArchiveCalendar = ({
  results,
  todayKey,
  selected,
  onSelect,
}: {
  results: DailyResults;
  todayKey: string;
  selected: string;
  onSelect: (dayKey: string) => void;
}) => {
  const [month, setMonth] = useState(selected.slice(0, 7)); // 'YYYY-MM'
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday-first
  // navigable range: the launch month through the current month
  const canPrev = dailyNumber(localDateKey(new Date(y, m - 1, 0))) >= 1;
  const canNext = localDateKey(new Date(y, m, 1)) <= todayKey;
  const shiftMonth = (by: number) => {
    const d = new Date(y, m - 1 + by, 1);
    setMonth(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  };
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <div className="cal-head">
        <button className="icon-btn" onClick={() => shiftMonth(-1)} disabled={!canPrev} aria-label="Previous month">
          ‹
        </button>
        <span className="cal-month">{monthLabel}</span>
        <button className="icon-btn" onClick={() => shiftMonth(1)} disabled={!canNext} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="cal-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={`wd${i}`} className="cal-wd" aria-hidden="true">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead${i}`} className="cal-cell cal-blank" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const key = `${y}-${pad2(m)}-${pad2(i + 1)}`;
          const num = dailyNumber(key);
          const released = num >= 1 && key <= todayKey;
          const r = results[key];
          const done = !!r && !r.skipped && r.score !== null;
          const cls = !released
            ? 'cal-off'
            : done
              ? r.late
                ? 'cal-late'
                : 'cal-done'
              : key === todayKey
                ? 'cal-open'
                : 'cal-missed';
          return (
            <button
              key={key}
              className={`cal-cell ${cls}${key === todayKey ? ' cal-today' : ''}${key === selected ? ' cal-sel' : ''}`}
              disabled={!released}
              onClick={() => onSelect(key)}
              aria-pressed={key === selected}
              aria-label={released ? `Daily #${num}, ${key}` : key}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="cal-legend">
        <span>
          <i className="cal-dot cal-done" /> played
        </span>
        <span>
          <i className="cal-dot cal-late" /> made up
        </span>
        <span>
          <i className="cal-dot cal-missed" /> missed
        </span>
        <span>
          <i className="cal-dot cal-off" /> not out
        </span>
      </div>
    </>
  );
};

/** The selected day: its song, your result, its top scores — and how to play it. */
const DayDetail = ({
  dayKey,
  results,
  todayKey,
  onStartDaily,
  onStartArchive,
  onStartPractice,
  onLeaderboard,
}: { dayKey: string } & Pick<
  Props,
  'results' | 'todayKey' | 'onStartDaily' | 'onStartArchive' | 'onStartPractice' | 'onLeaderboard'
>) => {
  const [info, setInfo] = useState<DailyInfo | null>(() => infoCache.get(dayKey) ?? null);
  const [infoError, setInfoError] = useState(false);
  const [board, setBoard] = useState<LeaderboardEntry[] | null>(() => boardCache.get(dayKey) ?? null);
  const [boardError, setBoardError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setInfo(infoCache.get(dayKey) ?? null);
    setBoard(boardCache.get(dayKey) ?? null);
    setInfoError(false);
    setBoardError(false);
    setStartError(null);
    if (!apiConfigured()) return;
    if (!infoCache.has(dayKey)) {
      fetchDaily(dayKey)
        .then((i) => {
          infoCache.set(dayKey, i);
          if (live) setInfo(i);
        })
        .catch(() => live && setInfoError(true));
    }
    if (!boardCache.has(dayKey)) {
      fetchLeaderboard(dayKey)
        .then((lb) => {
          if (dayKey !== todayKey) boardCache.set(dayKey, lb.today);
          if (live) setBoard(lb.today);
        })
        .catch(() => live && setBoardError(true));
    }
    return () => {
      live = false;
    };
  }, [dayKey, todayKey]);

  const num = dailyNumber(dayKey);
  const isToday = dayKey === todayKey;
  const r = results[dayKey];
  const done = !!r && !r.skipped && r.score !== null;
  const title = r?.title ?? info?.title;
  const artist = r?.artist ?? info?.artist;
  const dateLabel = new Date(`${dayKey}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const run = async (go: () => Promise<void>) => {
    setBusy(true);
    setStartError(null);
    try {
      await go(); // on success the run view takes over and this sheet closes
    } catch (err) {
      setStartError(
        err instanceof Error && err.message === 'open'
          ? 'that day is still being played around the world — come back tomorrow'
          : "couldn't fetch that day — are you online?"
      );
      setBusy(false);
    }
  };

  // Played days replay for fun; today runs the real daily; a closed missed day
  // is a make-up run (saved as `late`); a missed day still open somewhere on
  // Earth has to wait — the server won't reveal its answer yet.
  let action: JSX.Element | null = null;
  if (done) {
    const actual = r.actual;
    action =
      r.title && r.artist && actual != null ? (
        <button
          className="btn btn-ghost"
          onClick={() => onStartPractice(r.title!, r.artist!, actual, { key: dayKey, number: num })}
          title="Replays never change your score"
        >
          ↻ Replay for fun
        </button>
      ) : null;
  } else if (isToday) {
    action = (
      <button className="btn btn-primary" onClick={() => run(onStartDaily)} disabled={busy}>
        {busy ? 'Starting…' : "Play today's song"}
      </button>
    );
  } else if (info && info.bpm == null) {
    action = <p className="sheet-hint">still being played around the world — come back tomorrow</p>;
  } else {
    action = (
      <button
        className="btn btn-primary"
        onClick={() => run(() => onStartArchive(dayKey))}
        disabled={busy || (!info && !infoError)}
      >
        {busy ? 'Starting…' : 'Play this day'}
      </button>
    );
  }

  return (
    <div className="day-detail" aria-live="polite">
      <div className="day-detail-head">
        <span className="day-detail-num">Daily #{num}</span>
        <span className="day-detail-date">{isToday ? 'today' : dateLabel}</span>
      </div>
      <div className="daily-song day-detail-song">
        {title ? (
          <>
            <strong>{title}</strong>
            <span className="daily-artist">{artist}</span>
          </>
        ) : infoError ? (
          <span className="sheet-hint">couldn't load this day's song — are you online?</span>
        ) : (
          <span className="sheet-hint">loading…</span>
        )}
      </div>

      <div className="day-detail-you">
        {done ? (
          <>
            <span>
              you: 🎯 <strong>{r.score}</strong>/100
            </span>
            <span className="day-detail-sub">
              {r.guess !== null && <>tapped {r.guess}</>}
              {r.actual != null && <> · actual {r.actual}</>}
              {r.late ? ' · made up later' : ''}
            </span>
          </>
        ) : (
          <span className="day-detail-sub">{isToday
              ? "you haven't played yet"
              : 'you missed this one — playing it now saves on your device only'}</span>
        )}
      </div>

      {startError && <p className="sheet-hint start-error">{startError}</p>}
      {action && <div className="sheet-actions sheet-actions-center">{action}</div>}

      {apiConfigured() && (
        <div className="day-detail-board">
          <div className="day-detail-label">top scores</div>
          {boardError ? (
            <p className="sheet-hint">couldn't load the scores</p>
          ) : !board ? (
            <p className="sheet-hint">loading…</p>
          ) : board.length === 0 ? (
            <p className="sheet-hint">nobody on the board {isToday ? 'yet — be the first!' : 'that day'}</p>
          ) : (
            <ol className="lb-list lb-compact">
              {board.slice(0, TOP_SHOWN).map((e, i) => (
                <li key={i} className={`lb-row ${e.you ? 'lb-you' : ''}`}>
                  <span className="lb-rank">{MEDALS[i] ?? `${i + 1}.`}</span>
                  <span className="lb-nick">{e.nickname}</span>
                  <span className="lb-score">{e.score}</span>
                </li>
              ))}
            </ol>
          )}
          {/* the whole board is a reward for playing the day, not a browse feature */}
          {board && board.length > TOP_SHOWN && (
            <p className="sheet-hint day-detail-more">
              {done ? (
                <button className="linklike" onClick={() => onLeaderboard(dayKey)}>
                  see the full leaderboard ›
                </button>
              ) : (
                <>play this day to see the full leaderboard</>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const CalendarSheet = ({ selected, onSelect, onClose, ...rest }: Props) => {
  const detailRef = useRef<HTMLDivElement>(null);

  // on a short screen the panel sits below the fold — bring it into view
  const select = (key: string) => {
    onSelect(key);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };

  return (
    <div className="overlay overlay-center" onClick={onClose} data-no-tap>
      <div className="sheet cal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>📅 Past dailies</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <ArchiveCalendar results={rest.results} todayKey={rest.todayKey} selected={selected} onSelect={select} />
        <div ref={detailRef}>
          <DayDetail dayKey={selected} {...rest} />
        </div>
      </div>
    </div>
  );
};

export default CalendarSheet;
