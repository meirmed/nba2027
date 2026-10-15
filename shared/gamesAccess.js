// What the "games manager" (a normal player who may also choose the games) is allowed to do. The Firestore rules and the server enforce the
// same rule; this pure version drives the screens and is unit-tested.

/** A game he may edit, cancel or delete: it has NOT started (tip-off in the future) and is still scheduled or cancelled. Never a live / finished game. */
export const managerCanChangeGame = (game, nowMs) => !!game && ['scheduled', 'cancelled'].includes(game.status) && (game.tipoffMs ?? 0) > nowMs;

/** A game he may add / import: tip-off in the future. */
export const managerCanAddGame = (tipoffMs, nowMs) => Number.isFinite(tipoffMs) && tipoffMs > nowMs;

/** The only statuses he can set. Scores, overtime and "finished / live" stay with the admin. */
export const MANAGER_STATUSES = ['scheduled', 'cancelled'];
