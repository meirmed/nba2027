export const fmtNum = (n) => (Number.isFinite(n) ? new Intl.NumberFormat('en-US').format(n) : '–');
export const interpolate = (str, vars = {}) => str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
