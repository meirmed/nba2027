// Single menu definition. Bonus lives as a tab inside /predictions but has its own menu entry (deep link).
export const MENU = [
  { key: 'home', to: '/', label: 'nav.home', icon: '🏠' },
  { key: 'leaderboard', to: '/leaderboard', label: 'nav.leaderboard', icon: '🏆' },
  { key: 'results', to: '/results', label: 'nav.results', icon: '📊' },
  { key: 'games', to: '/predictions?tab=games', label: 'nav.gamePredictions', icon: '🏀' },
  { key: 'bonus', to: '/predictions?tab=bonus', label: 'nav.bonus', icon: '⭐' },
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
// "More" drawer on mobile: Bonus, My Points, Rules, Profile (+ Admin)
export const MORE_KEYS = ['bonus', 'mypoints', 'rules', 'profile', 'admin'];
