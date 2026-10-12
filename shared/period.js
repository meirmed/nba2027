import { addDaysToKey } from './daykeys.js';

/** Period filter shared by My Points, Results and the "next 7 days" predictions tab. -> {lo, hi} inclusive day keys, null = open end. */
export function rangeFor({ preset, today, from = '', to = '' }) {
  switch (preset) {
    case '7': return { lo: addDaysToKey(today, -6), hi: today };
    case '30': return { lo: addDaysToKey(today, -29), hi: today };
    case 'next7': return { lo: today, hi: addDaysToKey(today, 6) }; // today + the next 6 days = 7 calendar days
    case 'upcoming': return { lo: addDaysToKey(today, 1), hi: null };
    case 'custom': return { lo: from || null, hi: to || null };
    default: return { lo: null, hi: null }; // 'all'
  }
}
export const inRange = (key, { lo, hi }) => !((lo && key < lo) || (hi && key > hi));
