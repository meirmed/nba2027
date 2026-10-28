// The autosave of the predictions page: WHEN to save and WHAT to forget after a save. Pure, so the two rules that lost digits are unit-tested.

/** While the cursor is inside the score boxes of a game the player is still typing: wait 2 s after the last keystroke. As soon as he leaves the boxes
 *  (taps elsewhere, moves to the next game, presses Enter / Done, uses the joker) the save follows almost at once. */
export const AUTOSAVE_TYPING_MS = 2000;
export const AUTOSAVE_IDLE_MS = 250;
export const autosaveDelay = (typing) => (typing ? AUTOSAVE_TYPING_MS : AUTOSAVE_IDLE_MS);

const isNum = (v) => v !== '' && v !== undefined && v !== null && Number.isInteger(Number(v));

/**
 * After a save: the drafts to KEEP. A draft that still has exactly the value that was SENT is finished (the saved value replaces it). A draft the player
 * changed while the save was on its way (he typed "12", the save went out, he typed "3": the draft is now "123") must stay, so it is saved next time
 * and the digit is not lost. Rejected games stay too.
 * draft: {id: {s1, s2}} strings; sentPicks: {id: {s1, s2}} numbers that were sent; savedIds: the ids the server accepted.
 */
export function draftsAfterSave(draft, sentPicks, savedIds) {
  const saved = new Set(savedIds);
  return Object.fromEntries(Object.entries(draft).filter(([id, v]) => {
    const sent = sentPicks[id];
    const same = saved.has(id) && sent && isNum(v.s1) && isNum(v.s2) && Number(v.s1) === sent.s1 && Number(v.s2) === sent.s2;
    return !same;
  }));
}

/** The same for the joker switches: forget a switch only if it is still what was sent (a second tap during the save must stay). */
export function jokerDraftsAfterSave(jokerDraft, sentJokers, appliedIds) {
  const applied = new Set(appliedIds);
  return Object.fromEntries(Object.entries(jokerDraft).filter(([id, v]) => !(applied.has(id) && v === sentJokers[id])));
}
