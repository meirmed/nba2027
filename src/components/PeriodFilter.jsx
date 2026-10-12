import { useLang } from '../contexts/LangContext.jsx';

const PRESETS = ['7', '30', 'all', 'upcoming', 'custom'];
const LABEL = { 7: 'mp.range7', 30: 'mp.range30', all: 'mp.rangeAll', upcoming: 'mp.rangeUpcoming', custom: 'mp.rangeCustom' };

/** Buttons (last 7 days / 30 days / season / upcoming / custom) + From/To dates for "custom". `period` = usePeriod(). */
export default function PeriodFilter({ period, presets = PRESETS }) {
  const { t } = useLang();
  return (
    <>
      <div className="tabs scroll" role="tablist">
        {presets.map((p) => (
          <button key={p} role="tab" aria-selected={period.preset === p} className={`tab ${period.preset === p ? 'active' : ''}`} onClick={() => period.setPreset(p)}>
            {t(LABEL[p])}
          </button>
        ))}
      </div>
      {period.preset === 'custom' && (
        <div className="grid-form">
          <label className="field">{t('mp.from')}<input className="input" dir="ltr" type="date" max={period.today} value={period.from} onChange={(e) => period.setFrom(e.target.value)} /></label>
          <label className="field">{t('mp.to')}<input className="input" dir="ltr" type="date" value={period.to} onChange={(e) => period.setTo(e.target.value)} /></label>
        </div>
      )}
    </>
  );
}
