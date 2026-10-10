import { HttpsError } from 'firebase-functions/v2/https';

const BASE = 'https://api.balldontlie.io/v1/games';

/** GET /v1/games with cursor pagination. Free tier = 5 req/min, so never more than 4 pages per call. */
async function fetchPages(params, key) {
  const out = [];
  let cursor = null;
  for (let page = 0; page < 4; page += 1) {
    const url = new URL(BASE);
    params.forEach(([k, v]) => url.searchParams.append(k, v));
    url.searchParams.set('per_page', '100');
    if (cursor) url.searchParams.set('cursor', String(cursor));
    const res = await fetch(url, { headers: { Authorization: key } });
    if (res.status === 401) throw new HttpsError('failed-precondition', 'api-unauthorized');
    if (res.status === 429) throw new HttpsError('resource-exhausted', 'api-rate-limited');
    if (!res.ok) throw new HttpsError('unavailable', `api-${res.status}`);
    const body = await res.json();
    out.push(...(body.data || []));
    cursor = body.meta?.next_cursor;
    if (!cursor) break;
  }
  return out;
}

export const fetchGamesRange = (startDate, endDate, key) => fetchPages([['start_date', startDate], ['end_date', endDate]], key);
export const fetchGamesByDates = (dates, key) => fetchPages(dates.map((d) => ['dates[]', d]), key);

/** balldontlie "date" is the US game date; tip-off UTC date or the day before covers it. */
export const apiDatesFor = (tipoffMsList) => [...new Set(tipoffMsList.flatMap((ms) => [
  new Date(ms).toISOString().slice(0, 10), new Date(ms - 86400000).toISOString().slice(0, 10),
]))].sort();
