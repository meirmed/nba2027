// "Weekly summary" (admin): the interesting things that happened in a week of the game, found in the data, and a short funny text about them
// (at most 300 words, 3-4 paragraphs, metaphors from different worlds). Pure functions: the screen only loads the data. The facts are computed from
// points/{uid}.byDay (rank changes, leaders), the published picks of the week's games (streaks, hard games, jokers, exact / unique hits) and the scoring.
import { addDaysToKey, dayKeyOfMs } from './daykeys.js';
import { scoreGamePicks } from './standings.js';

export const MAX_WORDS = 300;
const r2 = (x) => Math.round(x * 100) / 100;
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he') || String(a.uid).localeCompare(String(b.uid));
export const wordCount = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;

// a Hebrew prefix letter on a name: "לדן" with a Hebrew name, "ל-Nir" with a Latin one
const pre = (letter, name) => (/^[\u0590-\u05FF]/.test(String(name)) ? `${letter}${name}` : `${letter}-${name}`);

const dow = (key) => new Date(`${key}T12:00:00Z`).getUTCDay(); // 0 = Sunday (the Israeli week starts on Sunday)

/** The weeks to choose from: [this week so far, the last completed week, ...]. {lo, hi, current}. */
export function weekOptions(todayKey, completed = 5) {
  const sunday = addDaysToKey(todayKey, -dow(todayKey));
  const out = [{ lo: sunday, hi: todayKey, current: true }];
  for (let i = 1; i <= completed; i += 1) { const lo = addDaysToKey(sunday, -7 * i); out.push({ lo, hi: addDaysToKey(lo, 6), current: false }); }
  return out;
}

/**
 * The table as it was at the end of `uptoDay`: the game points of the days up to it (byDay, with the joker) + the bonus and adjustments as they are now.
 * rank = 1 + the number of players with MORE points (equal points share a rank, so a tie at the start of the season is not a "move").
 */
export function rankAt(rows, uptoDay) {
  const list = rows.map((r) => {
    let g = 0;
    Object.entries(r.byDay || {}).forEach(([day, c]) => { if (day <= uptoDay) g += c[0] || 0; });
    return { uid: r.uid, name: r.name, pts: r2(g + (r.bonus ?? 0) + (r.adjust ?? 0)) };
  }).sort((a, b) => b.pts - a.pts || byName(a, b));
  return list.map((x) => ({ ...x, rank: 1 + list.filter((y) => y.pts > x.pts).length }));
}

const topOf = (list) => (list.length && list[0].pts > 0 && (list.length === 1 || list[0].pts > list[1].pts) ? list[0] : null); // a clear leader only

function monthLeaderAt(rows, monthKey, uptoDay) {
  const list = rows.map((r) => {
    let g = 0;
    Object.entries(r.byDay || {}).forEach(([day, c]) => { if (day.startsWith(monthKey) && day <= uptoDay) g += c[0] || 0; });
    return { uid: r.uid, name: r.name, pts: r2(g) };
  }).sort((a, b) => b.pts - a.pts || byName(a, b));
  return topOf(list);
}

const KIND_RANK = { exact: 3, exactMargin: 2, tier: 1, winner: 0 };
const KIND_NOUN = { exact: 'תוצאה מדויקת', exactMargin: 'הפרש מדויק', tier: 'הפרש קרוב מאוד', winner: 'ניחוש נכון' };
const kindOf = (s) => (s.exact ? 'exact' : s.exactMargin ? 'exactMargin' : s.diffTier ? 'tier' : 'winner');

/**
 * The facts of the week, best first: [{type, score, ...data}].
 * rows: points docs ({uid, name, byDay, bonus, adjust}); games: [{id, status, t1, t2, s1, s2, tipoffMs}] (counted games);
 * picksByGame: {gameId: {uid: {s1, s2, joker, autoFilled}}}; weekLo / weekHi = Israel day keys (inclusive).
 */
export function computeFacts({ rows, games, picksByGame, scoring, weekLo, weekHi, teamName = (a) => a }) {
  const facts = [];

  // ---- ranks: who climbed, who fell, who took the lead ----
  const before = rankAt(rows, addDaysToKey(weekLo, -1));
  const after = rankAt(rows, weekHi);
  const was = new Map(before.map((x) => [x.uid, x.rank]));
  const moves = after.map((a) => ({ uid: a.uid, name: a.name, from: was.get(a.uid), to: a.rank })).filter((m) => m.from).map((m) => ({ ...m, delta: m.from - m.to }));
  const up = [...moves].sort((a, b) => b.delta - a.delta || a.to - b.to || byName(a, b))[0];
  if (up && up.delta >= 2) facts.push({ type: 'climber', score: 30 + up.delta * 4, ...up });
  const down = [...moves].sort((a, b) => a.delta - b.delta || b.to - a.to || byName(a, b))[0];
  if (down && down.delta <= -2) facts.push({ type: 'faller', score: 25 + -down.delta * 4, ...down, drop: -down.delta });
  const leaderBefore = topOf(before);
  const leaderAfter = topOf(after);
  if (leaderBefore && leaderAfter && leaderBefore.uid !== leaderAfter.uid) facts.push({ type: 'leaderChange', score: 100, name: leaderAfter.name, prev: leaderBefore.name });
  const monthKey = weekHi.slice(0, 7);
  const dayBefore = addDaysToKey(weekLo, -1);
  if (dayBefore.startsWith(monthKey)) {
    const mAfter = monthLeaderAt(rows, monthKey, weekHi);
    const mBefore = monthLeaderAt(rows, monthKey, dayBefore);
    if (mAfter && mBefore && mAfter.uid !== mBefore.uid) facts.push({ type: 'monthLeader', score: 70, name: mAfter.name, prev: mBefore.name, month: monthKey });
  }

  // ---- the week's games, scored ----
  const week = games
    .filter((g) => g.status === 'finished' && Number.isInteger(g.s1) && Number.isInteger(g.s2) && g.tipoffMs && picksByGame[g.id])
    .filter((g) => { const d = dayKeyOfMs(g.tipoffMs); return d >= weekLo && d <= weekHi; })
    .sort((a, b) => a.tipoffMs - b.tipoffMs);
  const nameOf = Object.fromEntries(rows.map((r) => [r.uid, r.name]));
  const per = {}; // uid -> {pts, manual, exact, unique, seq: [true/false...]}
  const hardCandidates = [];
  const jokers = [];
  week.forEach((g) => {
    const picks = Object.entries(picksByGame[g.id]).map(([uid, p]) => ({ uid, p, joker: !!p.joker }));
    const res = scoreGamePicks({ game: { ...g, status: 'finished' }, picks, scoring });
    const real = picks.filter(({ p }) => !p.autoFilled);
    const correct = real.filter(({ uid }) => res[uid]?.winnerCorrect);
    const pct = real.length ? correct.length / real.length : 1;
    const label = `${teamName(g.t1)} נגד ${teamName(g.t2)}`;
    picks.forEach(({ uid, p, joker }) => {
      const s = res[uid];
      if (!s) return;
      const x = (per[uid] ||= { pts: 0, manual: 0, exact: 0, unique: 0, seq: [] });
      x.pts += s.pts;
      if (!p.autoFilled) {
        x.manual += 1; x.seq.push(!!s.winnerCorrect);
        if (s.exact) x.exact += 1;
        if (s.uniquePts > 0) x.unique += 1;
        if (joker) jokers.push({ uid, name: nameOf[uid] || p.name || '', pts: s.pts, label, pct });
      }
    });
    if (real.length >= 6 && pct <= 0.4 && correct.length > 0) {
      const heroes = correct.map(({ uid }) => ({ uid, s: res[uid] })).sort((a, b) => KIND_RANK[kindOf(b.s)] - KIND_RANK[kindOf(a.s)] || b.s.pts - a.s.pts || String(a.uid).localeCompare(String(b.uid)));
      const h = heroes[0];
      hardCandidates.push({ type: 'hardGame', score: 60 + Math.round((1 - pct) * 40) + KIND_RANK[kindOf(h.s)] * 5, name: nameOf[h.uid] || '', game: label, k: correct.length, n: real.length, kind: kindOf(h.s), kindNoun: KIND_NOUN[kindOf(h.s)] });
    }
  });
  const best = (arr) => [...arr].sort((a, b) => b.score - a.score)[0];
  if (hardCandidates.length) facts.push(best(hardCandidates));

  const people = Object.entries(per).map(([uid, x]) => ({ uid, name: nameOf[uid] || '', ...x }));
  const mvp = [...people].sort((a, b) => b.pts - a.pts || byName(a, b))[0];
  if (mvp && mvp.pts > 0) facts.push({ type: 'mvp', score: 55, name: mvp.name, pts: r2(mvp.pts) });
  const ghost = [...people].filter((p) => p.manual >= 3 && (!mvp || p.uid !== mvp.uid)).sort((a, b) => a.pts - b.pts || byName(a, b))[0];
  if (ghost && mvp && ghost.pts < mvp.pts) facts.push({ type: 'ghost', score: 35, name: ghost.name, pts: r2(ghost.pts) });

  const run = (seq, v) => { let m = 0; let c = 0; seq.forEach((x) => { c = x === v ? c + 1 : 0; m = Math.max(m, c); }); return m; };
  const hot = people.map((p) => ({ ...p, n: run(p.seq, true) })).sort((a, b) => b.n - a.n || byName(a, b))[0];
  if (hot && hot.n >= 4) facts.push({ type: 'hotStreak', score: 40 + hot.n * 6, name: hot.name, n: hot.n });
  const cold = people.map((p) => ({ ...p, n: run(p.seq, false) })).sort((a, b) => b.n - a.n || byName(a, b))[0];
  if (cold && cold.n >= 4) facts.push({ type: 'coldStreak', score: 35 + cold.n * 5, name: cold.name, n: cold.n });

  const win = [...jokers].sort((a, b) => b.pts - a.pts)[0];
  if (win && win.pts >= 20) facts.push({ type: 'jokerWin', score: 45, name: win.name, pts: r2(win.pts), game: win.label });
  const fail = [...jokers].filter((j) => j.pts === 0).sort((a, b) => b.pct - a.pct || byName(a, b))[0];
  if (fail) facts.push({ type: 'jokerFail', score: 40 + Math.round(fail.pct * 20), name: fail.name, game: fail.label });

  const exactKing = [...people].sort((a, b) => b.exact - a.exact || byName(a, b))[0];
  if (exactKing && exactKing.exact >= 2) facts.push({ type: 'exactKing', score: 35 + exactKing.exact * 5, name: exactKing.name, n: exactKing.exact });
  const wolf = [...people].sort((a, b) => b.unique - a.unique || byName(a, b))[0];
  if (wolf && wolf.unique >= 2) facts.push({ type: 'loneWolf', score: 35 + wolf.unique * 5, name: wolf.name, n: wolf.unique });

  return facts.sort((a, b) => b.score - a.score);
}

/** Up to `max` facts (8): the best ones, and nobody in more than three of them (so the text is not about one person only). */
export function selectFacts(facts, max = 8) {
  const used = {};
  const out = [];
  facts.forEach((f) => {
    if (out.length >= max) return;
    const names = [f.name, f.prev].filter(Boolean);
    if (names.some((n) => (used[n] || 0) >= 3)) return;
    names.forEach((n) => { used[n] = (used[n] || 0) + 1; });
    out.push(f);
  });
  return out;
}

// ---- the texts: metaphors from different worlds; no verb is about a person (the app does not know who is a he or a she) ----
const T = {
  climber: [
    (f) => `זינוק השבוע: ${f.name}, ${f.delta}+ מקומות (מ-${f.from} ל-${f.to}). בבורסה קוראים לזה "מניית צמיחה", ובשאר העולם: "מאיפה הניחושים האלה?"`,
    (f) => `טיפוס אוורסט: ${f.name} מהמקום ה-${f.from} ל-${f.to}. החמצן דליל, אבל הנוף מהפסגה כבר מתחיל להיראות.`,
    (f) => `אפקט הרקטה: ${f.name}, ${f.from}→${f.to}. בנאס"א מחפשים את מגרש השיגור, ובטבלה שואלים איך זה נעשה.`,
  ],
  faller: [
    (f) => `נפילה חופשית אצל ${f.name}: ${f.drop} מקומות למטה (${f.from}→${f.to}). אפילו הטיטניק עשה פחות רעש בדרך למטה.`,
    (f) => `דוח מזג אוויר: סערה מעל ${f.name}. ${f.drop} מקומות למטה (${f.from}→${f.to}). מומלץ להצטייד במטרייה ובניחושים חדשים.`,
    (f) => `${f.name}: מינוס ${f.drop} מקומות (${f.from}→${f.to}). נראה שהמחשב של הניחושים עשה אתחול בלי לשמור.`,
  ],
  leaderChange: [
    (f) => `החלפת שלטון: ${f.name} על כס הטבלה. אצל ${f.prev} עדיין מחפשים את הכתר מתחת לספה.`,
    (f) => `הדחה בשידור חי: ${f.name} מאחורי ההגה בראש הטבלה. אצל ${f.prev} בודקים בראי אם זה באמת קרה.`,
    (f) => `מלחמת כיסאות: הכיסא הראשון התפנה, ${pre('ו', f.name)} הגיע אליו קודם. ${pre('ל', f.prev)} נשארה כרית לנחמה.`,
  ],
  monthLeader: [
    (f) => `בראש מרוץ אלוף החודש (${f.monthName}): ${f.name}. עוד מוקדם לפתוח שמפניה, אבל לא מוקדם להזמין כוסות.`,
    (f) => `מרוץ אלוף החודש (${f.monthName}): ${f.name} בחזית, ${f.prev} במקום שני. זה טור דה פראנס, רק בלי האופניים.`,
  ],
  mvp: [
    (f) => `ה-MVP של השבוע: ${f.name} עם ${f.pts} נקודות. בהוליווד כבר מדפיסים כרטיסים לטקס האוסקר.`,
    (f) => `מלך השבוע: ${f.name}, ${f.pts} נקודות. כשהשאר מחפשים ניחושים בגוגל, אצל ${f.name} הכול נפתח בכרטיסייה השנייה.`,
    (f) => `${f.pts} נקודות אצל ${f.name} השבוע. פיזיקאים בודקים אם זה ניחוש או כבר פיזיקה קוונטית.`,
  ],
  ghost: [
    (f) => `רוח הרפאים של השבוע: ${f.name}, ${f.pts} נקודות. הנוכחות הורגשה בעיקר בקור שבחדר.`,
    (f) => `${f.pts} נקודות ${pre('ל', f.name)}. אפילו רובוט שואב שנתקע מתחת למיטה צבר יותר.`,
  ],
  hotStreak: [
    (f) => `רצף חם: ${f.n} פגיעות ברצף אצל ${f.name}. בקזינו בלאס וגאס כבר מבקשים תעודת זהות.`,
    (f) => `${f.n} ניחושים נכונים ברצף של ${f.name}. אפילו שעון שוויצרי טועה לפעמים.`,
    (f) => `מכונת קפה בלי תקלות: ${f.name}, ${f.n} פגיעות רצופות. גם הברמן הפסיק לשאול "מה הסוד?".`,
  ],
  coldStreak: [
    (f) => `${f.n} החטאות ברצף אצל ${f.name}. כשהמצפן מצביע דרומה ומנסים צפונה, זו לא תקלה, זו אסטרטגיה.`,
    (f) => `רצף הפספוסים של ${f.name}: ${f.n}. אפילו שעון מקולקל מדייק פעמיים ביום, וזה עוד לא קרה.`,
    (f) => `משרד הבריאות מזהיר: ${f.n} פספוסים רצופים אצל ${f.name}. מומלץ מנוחה, מים וניחוש הפוך.`,
  ],
  hardGame: [
    (f) => `במשחק הקשה ${f.game} רק ${f.k} מתוך ${f.n} ניחשו את המנצח, וביניהם ${f.name}, עם ${f.kindNoun}. בלי כדור בדולח, רק אינסטינקט של חתול.`,
    (f) => `${f.game}: ${f.k} מתוך ${f.n} צדקו, ${pre('ו', f.name)} בהם, עם ${f.kindNoun}. נראה שאצל ${f.name} יש נוסטרדמוס בלוח התוצאות.`,
    (f) => `פצצה ב${f.game}: ${f.n - f.k} מתוך ${f.n} נפלו בפח. את ${f.name} זה לא הפתיע, עם ${f.kindNoun}.`,
  ],
  jokerFail: [
    (f) => `הג׳וקר של ${f.name} על ${f.game} נחת על אפס. אפילו קוסם עם כובע ריק מוציא ארנב.`,
    (f) => `ג׳וקר שהפך לבדיחה: על ${f.game} הונח הג׳וקר של ${f.name}, והתוצאה: אפס כפול שתיים.`,
  ],
  jokerWin: [
    (f) => `ג׳וקר של זהב: ${f.pts} נקודות מ${f.game} אצל ${f.name}. זה כבר לא ניחוש, זו הנפקה בבורסה.`,
    (f) => `הג׳וקר של ${f.name} על ${f.game} הניב ${f.pts} נקודות. ככה נראית תשואה עם חיוך של בנקאי.`,
  ],
  exactKing: [
    (f) => `מלך המדויקות: ${f.name}, ${f.n} תוצאות מדויקות. אצל ${f.name} כנראה יש כדור בדולח, או שזה רק מזל.`,
    (f) => `${f.n} תוצאות מדויקות אצל ${f.name} השבוע. אפילו מחשב-על היה מבקש הסבר.`,
  ],
  loneWolf: [
    (f) => `זאב בודד של השבוע: ${f.name}, ${f.n} פגיעות ייחודיות. כשכל העדר הולך שמאלה, יש מי שפשוט שומע שיר אחר.`,
    (f) => `${f.n} פגיעות ייחודיות אצל ${f.name}: מי שהולך לבד מגיע לפעמים ראשון, ולפעמים לבד.`,
  ],
};
// a second sentence for every fact (any variant of the first sentence can be followed by any of these): the text is about twice as long as with the first sentence only
const E = {
  climber: ['בינתיים בתחתית מסתכלים למעלה ושואלים אם יש שם עוד מקום, או לפחות חדר עם נוף.', 'אם זה היה פורמולה 1, כבר היו בודקים מי החליף את המנוע באמצע המירוץ.', 'בעמדות האחוריות כבר מתחילים לתכנן מבצע שחזור: איך עושים בדיוק את זה.'],
  faller: ['כל נדנדה עולה ויורדת, והשאלה היא רק מתי תתהפך הכף.', 'בשוק ההון מציעים דרך חזרה אחת: לקנות בנמוך ולנחש בגבוה.', 'ימים כאלה הם החימום לקאמבק, והמרק של הקאמבק עוד על האש.'],
  leaderChange: ['בכתר הזה אין ביטוח, אין חגורה ואין תקופת הסתגלות.', 'היסטוריונים כבר מתעדים את התקופה, והאופוזיציה כבר מנסחת עצומה.', 'מי שישב פעם על כס יודע שהוא חם, בעיקר כשנשמעים מאחור צעדים.'],
  monthLeader: ['החודש עוד ארוך, והמרתון הזה לא מוכרע בקילומטר הראשון.', 'עוד לפנינו מהמורות, כולל כמה משחקי הפתעה שאף אחד לא הזמין.', 'אצל המתחרים כבר מכינים תוכנית פעולה, תוכנית חלופית וקפה.'],
  mvp: ['אפשר להתחיל לפנות מקום על המדף: הגביע הזה כבר מרגיש בבית.', 'המתחרים מבקשים בדיקת סמים, וגוגל מבקש הסבר.', 'השאלה היא לא אם זה מזל, אלא איזה סוג של מזל.'],
  ghost: ['בינתיים אין סיבה להיסחף: גם לירח יש צד אפל, והוא נראה מצוין בשבוע הבא.', 'מי שמצפה לקאמבק מוזמן להתחיל לתכנן אותו מוקדם.', 'הטבלה זוכרת הכול, אבל לפחות היא סלחנית.'],
  hotStreak: ['הניחושים עובדים כמו שעון, ועוד לא ברור איזה שעון.', 'הקהל עוצר נשימה ובודק אם אפשר להזמין את אותו הדבר.', 'ברצף כזה אסור להתעטש, ולבדוק את הנעליים מומלץ.'],
  coldStreak: ['ברוח הספורט, שבועות כאלה בונים אופי, בעיקר כשהטבלה צופה.', 'אין מה לדאוג: גם הטיטניק התחיל כשיט מפואר.', 'זה הזמן להחליף שיטה, כובע, או לפחות מזל.'],
  hardGame: ['השאר התפזרו בבלבול, ובטבלה נפתח פער מכובד.', 'זה מהמקרים שבהם אפילו האנליסטים באולפן שותקים לרגע.', 'המחשב הרשמי מחכה לעוד נתונים לפני שיכריז אם זה כישרון או מזל.'],
  jokerFail: ['ככה זה בקזינו: הכפלה של כלום נשארת כלום, גם כשעושים אותה בהתלהבות.', 'הג׳וקר שמר על ההבטחה: הוא אכן הכפיל, בדיוק את מה שהיה.', 'נותר לקוות שהג׳וקר הבא יגיע עם חוברת הוראות.'],
  jokerWin: ['אחרי רווח כזה, הבנקים כבר שוקלים להציע משכנתא.', 'בבורסה זה נקרא "כניסה מושלמת", ובשולחן הקלפים: "ידיים טובות".', 'המתחרים התחילו לקרוא ספרות על ניהול סיכונים.'],
  exactKing: ['כדאי לבדוק את הטבלה, ואולי גם את הכוכבים.', 'מדויקות כזאת מעוררת קנאה, ובקרוב גם בקשות להסבר.', 'הדיוק הזה הוא כבר סוג של מקצוע.'],
  loneWolf: ['בטבלה אומרים: מי שפונה שמאלה כשכולם פונים ימינה, או מנצח או מגלה דרך חדשה.', 'בעולם הטבע זאב בודד מקבל פרק משלו, ובטבלה הוא מקבל נקודות.', 'העדר ימשיך ללכת, והזאב ימשיך לשמוע מוזיקה אחרת.'],
};
// and a closing line (a third sentence): together with the fact and the second sentence the text is about twice as long as the first version
const C = {
  climber: ['הדרך למעלה זרועה בניחושים טובים, וההרשמה למסלול עדיין פתוחה.', 'בקצב כזה, האוויר בפסגה כבר מתחיל להיות מוכר.', 'מהנדסי הפיזיקה מתלבטים אם זה כוח משיכה הפוך או פשוט מזל מתוחכם.'],
  faller: ['בינתיים מומלץ לאחוז בחגורה ולא לעצור לצלם.', 'כוח המשיכה פועל בכל מקרה, אבל הנחיתה עוד לא נקבעה.', 'גם סלע שמתגלגל מהר מגיע בסוף לעמק, ושם יש נוף יפה.'],
  leaderChange: ['בחדשות קוראים לזה שינוי כיוון, ובטבלה קוראים לזה שבוע.', 'הפרשנים כבר ציינו שהקרב על הכס רק התחיל ואין לו שופט אחד.', 'מי שעוד לא התאושש יכול להתנחם בכך שכל כס הוא זמני, כמו חניה בתל אביב.'],
  monthLeader: ['ברמת המרתון, עוד לא עברו את תחנת המים הראשונה.', 'כל נקודה חשובה, וגם כל ניחוש שנשכח להזין.', 'כדאי לקרוא את החוקים, ולא רק את הטבלה.'],
  mvp: ['בכדורסל אמיתי כבר היו תולים חולצה בתקרה, כאן מסתפקים בכמה לייקים.', 'הטבלה מתייפחת מהתרגשות, והמחשבון עדיין מנסה לעכל.', 'כשכולם רק מנחשים, כאן נראה שיש תוכנית עבודה ומחברת.'],
  ghost: ['זה לא סוף העולם, זה בסך הכול סוף שבוע.', 'בית הקפה עדיין פתוח, והטבלה עדיין זמינה.', 'מי שרוצה לעודד מוזמן לשלוח ניחוש או שניים לעזרה ראשונה.'],
  hotStreak: ['הבורסה מדווחת על ביקוש גבוה למניה הזאת ועל חוסר בהסברים.', 'בפורמולה 1 קוראים לזה "פול פוזישן", כאן קוראים לזה "שבוע טוב".', 'כל מי שמסתכל על הנתונים כבר שוקל לשנות את שיטת הניחושים שלו.'],
  coldStreak: ['הקהל מעודד מהיציע, ולפעמים אפילו מנסה לשלוח הוראות מהספה.', 'כל קבוצה חזקה מכירה את המשחק שאחרי השבוע הרע, והוא תמיד טוב יותר.', 'בינתיים הטבלה ממשיכה לצחוק בקול נמוך, כמו בספרייה.'],
  hardGame: ['ככה נראה ניחוש שמגיע מהבטן ולא מהאקסל.', 'הרוב צדק על הנייר, והמציאות החליטה אחרת.', 'עיתונאי הספורט עדיין כותבים את הכותרת, והיא נראית כמו סימן שאלה.'],
  jokerFail: ['המסקנה: ג׳וקר הוא כלי חזק, אבל הוא פועל רק עם חומר גלם.', 'אפילו בסיפורי אגדות הקסם עובד רק כשיש מה לקסום.', 'בהצלחה לג׳וקר הבא, שיבוא עם ביטוח.'],
  jokerWin: ['ככה נראה חשבון בנק אחרי הימור נכון, גם אם החשבון הוא נקודות.', 'המתחרים בוחנים ברצינות להחזיק ג׳וקר בכיס האחורי לעוד שבוע.', 'המזל מעיר שהוא רק הגיע לביקור, והמיומנות מעירה שהיא גרה כאן.'],
  exactKing: ['האם יש לזה הסבר מדעי? כנראה. האם הוא מעניין? פחות.', 'השופט נראה מוטרד, והכדור נראה מבולבל.', 'בקצב כזה כדאי לבדוק שמפתחות המכונית לא נעלמים.'],
  loneWolf: ['העדר כבר שואל אם אפשר להיות מאושרים בלי להסכים עם כולם.', 'ההליכה לבד הולכת טוב, בעיקר כשהמפה נמצאת בכיס.', 'יש מי שמכנה את זה אינדיבידואליזם, ויש מי שקורא לזה פשוט מזל.'],
};
const QUIET = 'שבוע שקט בטבלה: כל המשתתפים התקדמו בקצב של תור בסניף הדואר. נחכה לשבוע הבא, שבטח יהיה סוער יותר.';

// a deterministic "random" choice: the same seed always gives the same text, and a new seed gives a new mix (not a short cycle)
function rnd(seed, salt) {
  let x = (Math.imul(seed + 1, 2654435761) ^ Math.imul(salt + 7, 40503)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 3266489917) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
const pick = (list, seed, salt) => list[Math.floor(rnd(seed, salt) * list.length)];

/** n texts into paragraphs: up to 4 facts = a paragraph each; more = 4 paragraphs, the strongest ones get two facts. */
function toParagraphs(parts) {
  if (parts.length <= 4) return parts;
  const extra = parts.length - 4;
  const out = [];
  let i = 0;
  for (let p = 0; p < 4; p += 1) { const size = p < extra ? 2 : 1; out.push(parts.slice(i, i + size).join(' ')); i += size; }
  return out;
}

/**
 * The summary: a text for every fact (the fact + a second sentence + a closing line), up to 8 facts in 3-4 paragraphs (fewer paragraphs when the week was quiet),
 * at most 300 words in all (the weakest fact is dropped if it is longer). seed picks the variants: a different seed = another version of the same facts.
 */
export function writeSummary(facts, { seed = 0, monthName = (k) => k } = {}) {
  let used = selectFacts(facts, 8);
  if (used.length === 0) return { paragraphs: [QUIET], words: wordCount(QUIET), facts: [] };
  const sd = Math.abs(Math.trunc(seed));
  const parts = used.map((f, i) => `${pick(T[f.type], sd, i * 3)({ ...f, monthName: f.month ? monthName(f.month) : '' })} ${pick(E[f.type], sd, i * 3 + 1)} ${pick(C[f.type], sd, i * 3 + 2)}`);
  let paragraphs = toParagraphs(parts);
  while (used.length > 1 && wordCount(paragraphs.join(' ')) > MAX_WORDS) { used = used.slice(0, -1); paragraphs = toParagraphs(parts.slice(0, used.length)); } // drop the weakest
  return { paragraphs, words: wordCount(paragraphs.join(' ')), facts: used };
}

/** A line per fact, for the admin to check and for the prompt. */
export function factLine(f) {
  switch (f.type) {
    case 'climber': return `${f.name} עלה ${f.delta} מקומות בטבלה (מהמקום ${f.from} ל-${f.to})`;
    case 'faller': return `${f.name} ירד ${f.drop} מקומות בטבלה (מהמקום ${f.from} ל-${f.to})`;
    case 'leaderChange': return `${f.name} תפס את ראש הטבלה במקום ${f.prev}`;
    case 'monthLeader': return `${f.name} הוביל את אלוף החודש (${f.month}) במקום ${f.prev}`;
    case 'mvp': return `${f.name} צבר הכי הרבה נקודות השבוע: ${f.pts}`;
    case 'ghost': return `${f.name} צבר הכי מעט נקודות השבוע (מבין מי שניחשו): ${f.pts}`;
    case 'hotStreak': return `${f.name} פגע ב-${f.n} מנצחים נכונים ברצף`;
    case 'coldStreak': return `${f.name} החטיא ${f.n} מנצחים ברצף`;
    case 'hardGame': return `במשחק ${f.game} רק ${f.k} מתוך ${f.n} ניחשו את המנצח, ו${f.name} פגע עם ${f.kindNoun}`;
    case 'jokerFail': return `${f.name} הניח ג׳וקר על ${f.game} וקיבל 0 נקודות`;
    case 'jokerWin': return `${f.name} קיבל ${f.pts} נקודות מג׳וקר על ${f.game}`;
    case 'exactKing': return `${f.name} פגע ב-${f.n} תוצאות מדויקות השבוע`;
    case 'loneWolf': return `${f.name} פגע ב-${f.n} תוצאות ייחודיות (רק הוא פגע) השבוע`;
    default: return JSON.stringify(f);
  }
}

/** A ready prompt for Claude (or any chat assistant): the same facts, for a fresher text. */
export function claudePrompt(facts) {
  const lines = (facts.length ? facts : []).map((f) => `- ${factLine(f)}`).join('\n') || '- שבוע שקט, לא קרה משהו חריג';
  return `כתוב סיכום שבועי הומוריסטי בעברית לקבוצת חברים שמשחקים משחק ניחושי NBA.
דרישות: עד ${MAX_WORDS} מילים, 3 עד 4 פסקאות (פחות אם אין הרבה מה לספר). הומור חד ואוהב, עם מושגים ודימויים מעולמות שונים (ספורט, בורסה, טיפוס הרים, חלל, קולנוע, מטבח וכו') על המשתתפים ועל מה שקרה השבוע. ניסוח ניטרלי מבחינה מגדרית (אנחנו לא יודעים מי גבר ומי אישה), בלי העלבות, ובלי להמציא עובדות מעבר לרשימה.
העובדות של השבוע:
${lines}`;
}
