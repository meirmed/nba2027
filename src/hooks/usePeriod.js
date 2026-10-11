import { useMemo, useState } from 'react';
import { dayKey } from '../utils/dates.js';
import { addDaysToKey } from '@shared/daykeys.js';
import { rangeFor } from '@shared/period.js';

/** Period filter state shared by Results and My Points. Default = last 7 days. */
export function usePeriod(timezone) {
  const [preset, setPreset] = useState('7');
  const [from, setFrom] = useState(() => addDaysToKey(dayKey(new Date(), timezone), -6));
  const [to, setTo] = useState(() => dayKey(new Date(), timezone));
  const today = dayKey(new Date(), timezone);
  const range = useMemo(() => rangeFor({ preset, today, from, to }), [preset, today, from, to]);
  return { preset, setPreset, from, setFrom, to, setTo, today, range };
}
