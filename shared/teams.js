// 30 NBA teams. shortEn/shortHe = city (nickname for the two LA teams) - used on narrow screens. Seeded into Firestore teams/{abbr} by Admin -> Games -> "Seed teams" (admin-editable afterwards).
export const TEAMS = [
  { abbr: 'ATL', en: 'Atlanta Hawks', he: 'אטלנטה הוקס', conf: 'E', color: '#E03A3E', shortEn: 'Atlanta', shortHe: 'אטלנטה' },
  { abbr: 'BOS', en: 'Boston Celtics', he: 'בוסטון סלטיקס', conf: 'E', color: '#008348', shortEn: 'Boston', shortHe: 'בוסטון' },
  { abbr: 'BKN', en: 'Brooklyn Nets', he: 'ברוקלין נטס', conf: 'E', color: '#8A8D8F', shortEn: 'Brooklyn', shortHe: 'ברוקלין' },
  { abbr: 'CHA', en: 'Charlotte Hornets', he: 'שארלוט הורנטס', conf: 'E', color: '#00A5C0', shortEn: 'Charlotte', shortHe: 'שארלוט' },
  { abbr: 'CHI', en: 'Chicago Bulls', he: 'שיקגו בולס', conf: 'E', color: '#CE1141', shortEn: 'Chicago', shortHe: 'שיקגו' },
  { abbr: 'CLE', en: 'Cleveland Cavaliers', he: 'קליבלנד קאבלירס', conf: 'E', color: '#B3123E', shortEn: 'Cleveland', shortHe: 'קליבלנד' },
  { abbr: 'DET', en: 'Detroit Pistons', he: 'דטרויט פיסטונס', conf: 'E', color: '#C8102E', shortEn: 'Detroit', shortHe: 'דטרויט' },
  { abbr: 'IND', en: 'Indiana Pacers', he: 'אינדיאנה פייסרס', conf: 'E', color: '#FDBB30', shortEn: 'Indiana', shortHe: 'אינדיאנה' },
  { abbr: 'MIA', en: 'Miami Heat', he: 'מיאמי היט', conf: 'E', color: '#98002E', shortEn: 'Miami', shortHe: 'מיאמי' },
  { abbr: 'MIL', en: 'Milwaukee Bucks', he: 'מילווקי באקס', conf: 'E', color: '#00843D', shortEn: 'Milwaukee', shortHe: 'מילווקי' },
  { abbr: 'NYK', en: 'New York Knicks', he: 'ניו יורק ניקס', conf: 'E', color: '#F58426', shortEn: 'New York', shortHe: 'ניו יורק' },
  { abbr: 'ORL', en: 'Orlando Magic', he: 'אורלנדו מג׳יק', conf: 'E', color: '#0077C0', shortEn: 'Orlando', shortHe: 'אורלנדו' },
  { abbr: 'PHI', en: 'Philadelphia 76ers', he: 'פילדלפיה 76', conf: 'E', color: '#006BB6', shortEn: 'Philadelphia', shortHe: 'פילדלפיה' },
  { abbr: 'TOR', en: 'Toronto Raptors', he: 'טורונטו ראפטורס', conf: 'E', color: '#CE1141', shortEn: 'Toronto', shortHe: 'טורונטו' },
  { abbr: 'WAS', en: 'Washington Wizards', he: 'וושינגטון ויזארדס', conf: 'E', color: '#E31837', shortEn: 'Washington', shortHe: 'וושינגטון' },
  { abbr: 'DAL', en: 'Dallas Mavericks', he: 'דאלאס מאבריקס', conf: 'W', color: '#00538C', shortEn: 'Dallas', shortHe: 'דאלאס' },
  { abbr: 'DEN', en: 'Denver Nuggets', he: 'דנבר נאגטס', conf: 'W', color: '#FEC524', shortEn: 'Denver', shortHe: 'דנבר' },
  { abbr: 'GSW', en: 'Golden State Warriors', he: 'גולדן סטייט ווריורס', conf: 'W', color: '#FFC72C', shortEn: 'Golden State', shortHe: 'גולדן סטייט' },
  { abbr: 'HOU', en: 'Houston Rockets', he: 'יוסטון רוקטס', conf: 'W', color: '#CE1141', shortEn: 'Houston', shortHe: 'יוסטון' },
  { abbr: 'LAC', en: 'LA Clippers', he: 'לוס אנג׳לס קליפרס', conf: 'W', color: '#1D8CD8', shortEn: 'Clippers', shortHe: 'קליפרס' },
  { abbr: 'LAL', en: 'Los Angeles Lakers', he: 'לוס אנג׳לס לייקרס', conf: 'W', color: '#9B6FD0', shortEn: 'Lakers', shortHe: 'לייקרס' },
  { abbr: 'MEM', en: 'Memphis Grizzlies', he: 'ממפיס גריזליס', conf: 'W', color: '#5D76A9', shortEn: 'Memphis', shortHe: 'ממפיס' },
  { abbr: 'MIN', en: 'Minnesota Timberwolves', he: 'מינסוטה טימברוולבס', conf: 'W', color: '#236192', shortEn: 'Minnesota', shortHe: 'מינסוטה' },
  { abbr: 'NOP', en: 'New Orleans Pelicans', he: 'ניו אורלינס פליקנס', conf: 'W', color: '#85714D', shortEn: 'New Orleans', shortHe: 'ניו אורלינס' },
  { abbr: 'OKC', en: 'Oklahoma City Thunder', he: 'אוקלהומה סיטית׳אנדר', conf: 'W', color: '#007AC1', shortEn: 'Oklahoma City', shortHe: 'אוקלהומה סיטי' },
  { abbr: 'PHX', en: 'Phoenix Suns', he: 'פיניקס סאנס', conf: 'W', color: '#E56020', shortEn: 'Phoenix', shortHe: 'פיניקס' },
  { abbr: 'POR', en: 'Portland Trail Blazers', he: 'פורטלנד טרייל בלייזרס', conf: 'W', color: '#E03A3E', shortEn: 'Portland', shortHe: 'פורטלנד' },
  { abbr: 'SAC', en: 'Sacramento Kings', he: 'סקרמנטו קינגס', conf: 'W', color: '#7A4FB5', shortEn: 'Sacramento', shortHe: 'סקרמנטו' },
  { abbr: 'SAS', en: 'San Antonio Spurs', he: 'סן אנטוניו ספרס', conf: 'W', color: '#C4CED4', shortEn: 'San Antonio', shortHe: 'סן אנטוניו' },
  { abbr: 'UTA', en: 'Utah Jazz', he: 'יוטה ג׳אז', conf: 'W', color: '#F9A01B', shortEn: 'Utah', shortHe: 'יוטה' },
];
export const TEAMS_BY_ABBR = Object.fromEntries(TEAMS.map((t) => [t.abbr, t]));

/** The 6 NBA divisions (5 teams each). conf = E/W. Used by the "division teams" bonus questions. */
export const DIVISIONS = {
  atlantic: { en: 'Atlantic', he: 'אטלנטיק', conf: 'E', teams: ['BOS', 'BKN', 'NYK', 'PHI', 'TOR'] },
  central: { en: 'Central', he: 'סנטרל', conf: 'E', teams: ['CHI', 'CLE', 'DET', 'IND', 'MIL'] },
  southeast: { en: 'Southeast', he: 'סאות׳איסט', conf: 'E', teams: ['ATL', 'CHA', 'MIA', 'ORL', 'WAS'] },
  northwest: { en: 'Northwest', he: 'נורת׳ווסט', conf: 'W', teams: ['DEN', 'MIN', 'OKC', 'POR', 'UTA'] },
  pacific: { en: 'Pacific', he: 'פסיפיק', conf: 'W', teams: ['GSW', 'LAC', 'LAL', 'PHX', 'SAC'] },
  southwest: { en: 'Southwest', he: 'סאות׳ווסט', conf: 'W', teams: ['DAL', 'HOU', 'MEM', 'NOP', 'SAS'] },
};
