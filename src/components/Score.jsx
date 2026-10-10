import { useLang } from '../contexts/LangContext.jsx';

/**
 * "home – away" score. Each number is its own flex item and the root gets the PAGE direction explicitly, so the home score
 * is on the same side as the home team everywhere: Hebrew (RTL) = right, English (LTR) = left - even inside forced-ltr tables.
 */
export default function Score({ a, b }) {
  const { dir } = useLang();
  return <span className="score" dir={dir}><span>{a}</span><span className="muted">–</span><span>{b}</span></span>;
}
