// Single menu definition. Bonus questions are a tab inside /predictions (no separate menu entry).
export const MENU = [
  { key: 'home', to: '/', label: 'nav.home', icon: '🏠' },
  { key: 'leaderboard', to: '/leaderboard', label: 'nav.leaderboard', icon: '🏆' },
  { key: 'results', to: '/results', label: 'nav.results', icon: '📊' },
  { key: 'games', to: '/predictions?tab=games', label: 'nav.gamePredictions', icon: '🏀' },
  { key: 'mypoints', to: '/my-points', label: 'nav.myPoints', icon: '🧾' },
  { key: 'h2h', to: '/h2h', label: 'nav.h2h', icon: '⚔️' },
  { key: 'rules', to: '/rules', label: 'nav.rules', icon: '📖' },
  { key: 'profile', to: '/profile', label: 'nav.profile', icon: '👤' },
  { key: 'admin', to: '/admin', label: 'nav.admin', icon: '🛠️', adminOnly: true },
];

// Mobile bottom nav (WC): Home | Predictions | Results | Leaderboard | H2H | More
export const BOTTOM = [
  { key: 'home', to: '/', label: 'nav.home', icon: '🏠' },
  { key: 'predictions', to: '/predictions', label: 'nav.predictions', icon: '🏀' },
  { key: 'results', to: '/results', label: 'nav.results', icon: '📊' },
  { key: 'leaderboard', to: '/leaderboard', label: 'nav.leaderboard', icon: '🏆' },
  { key: 'h2h', to: '/h2h', label: 'nav.h2h', icon: '⚔️' },
];
// "More" drawer on mobile: My Points, Rules, Profile (+ Admin). Bonus questions are a tab inside Predictions, so no separate entry on phones.
export const MORE_KEYS = ['mypoints', 'rules', 'profile', 'admin'];
