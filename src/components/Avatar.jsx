import { useState } from 'react';

const hue = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** Profile picture, or a coloured circle with the first letter of the name. */
export default function Avatar({ name, url, size = 28 }) {
  const [bad, setBad] = useState(false);
  if (url && !bad) return <img className="avatar" src={url} alt="" width={size} height={size} onError={() => setBad(true)} />;
  return <span className="avatar" style={{ width: size, height: size, background: `hsl(${hue(name || '?')} 55% 42%)` }} aria-hidden>{(name || '?').trim().charAt(0).toUpperCase()}</span>;
}
