import { useMemo } from 'react';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { useGames } from './useGames.js';
import { dayKey } from '../utils/dates.js';
import { countsForStandings } from '@shared/games.js';
import { inRange, rangeFor } from '@shared/period.js';
import { showInPredictions } from '@shared/predictions.js';

/**
 * Counted games from today through the next 6 days (7 calendar days, Israel time), grouped by day: [[dayKey, games[]]...].
 * A game is hidden one hour after its tip-off (`hidden` counts them); the Results page keeps it.
 */
export function useWeekGames(nowMs) {
  const settings = useSettings();
  const { games, loading } = useGames();
  const tz = settings.timezone;
  const today = dayKey(new Date(nowMs), tz);
  const range = rangeFor({ preset: 'next7', today });
  const minute = Math.floor(nowMs / 60000);
  const { groups, hidden } = useMemo(() => {
    const m = new Map();
    let hiddenCount = 0;
    games.filter((g) => countsForStandings(g, settings.countedRounds)).forEach((g) => {
      const k = dayKey(g.tipoff, tz);
      if (!inRange(k, range)) return;
      if (!showInPredictions(g.tipoff?.toMillis?.() ?? 0, minute * 60000)) { hiddenCount += 1; return; }
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(g);
    });
    return { groups: [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])), hidden: hiddenCount };
  }, [games, settings.countedRounds, tz, range.lo, range.hi, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  return { groups, games: groups.flatMap(([, list]) => list), hidden, loading, today };
}
