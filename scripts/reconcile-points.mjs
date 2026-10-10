// Reconciliation now runs inside the app: Admin -> Scoring -> "Run reconciliation" (callable `reconcilePoints`).
// It recomputes every user's points from raw games + predictions with shared/standings.js and diffs against points/{uid}.
console.log('Use Admin -> Scoring -> Run reconciliation. Expected result: 0 mismatches.');
