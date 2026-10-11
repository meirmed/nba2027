/** "A  pts ⚔ pts  B" in one line. No forced direction: Hebrew puts the first player on the right (like the World Cup app). */
export default function VsRow({ nameA, scoreA, nameB, scoreB, winner, note }) {
  return (
    <div className="vs-row">
      <span className={`vs-name ${winner === 'a' ? 'win' : ''}`} dir="auto">{nameA}</span>
      <span className="vs-score">{scoreA}</span>
      <span className="vs-x" aria-hidden>⚔️</span>
      <span className="vs-score">{scoreB}</span>
      <span className={`vs-name vs-end ${winner === 'b' ? 'win' : ''}`} dir="auto">{nameB}</span>
      {note && <small className="muted vs-note">{note}</small>}
    </div>
  );
}
