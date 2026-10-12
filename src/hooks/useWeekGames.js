import { useMemo } from 'react';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { useGames } from './useGames.js';
import { dayKey } from '../utils/dates.js';
import { countsForStandings } from '@shared/games.js';
import { inRange, rangeFor } from '@shared/period.js';

/** Counted games from today through the next 6 days (7 calendar days, Israel time), grouped by day: [[dayKey, games[]]...]. */
export function useWeekGames(nowMs) {
  const settings = useSettings();
  const { games, loading } = useGames();
  const tz = settings.timezone;
  const today = dayKey(new Date(nowMs), tz);
  const range = rangeFor({ preset: 'next7', today });
  const groups = useMemo(() => {
    const m = new Map();
    games.filter((g) => countsForStandings(g, settings.countedRounds)).forEach((g) => {
      const k = dayKey(g.tipoff, tz);
      if (!inRange(k, range)) return;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(g);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [games, settings.countedRounds, tz, range.lo, range.hi]); // eslint-disable-line react-hooks/exhaustive-deps
  return { groups, games: groups.flatMap(([, list]) => list), loading, today };
}
