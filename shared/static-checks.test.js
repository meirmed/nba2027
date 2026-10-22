// Safety nets that run on every `npm run test`: texts exist in BOTH languages, no right-to-left-unsafe CSS, no secrets in the repo.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BONUS_TYPES, GAME_ROUNDS } from './constants.js';
import { GAME_STATUSES } from './games.js';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const walk = (dir) => readdirSync(join(root, dir)).flatMap((f) => {
  const rel = join(dir, f);
  return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
});
const en = JSON.parse(read('src/i18n/en.json'));
const he = JSON.parse(read('src/i18n/he.json'));
const srcFiles = walk('src').filter((f) => /\.(jsx?|mjs)$/.test(f));

describe('i18n', () => {
  it('English and Hebrew have exactly the same keys, none empty', () => {
    expect(Object.keys(he).sort()).toEqual(Object.keys(en).sort());
    Object.entries({ ...en }).forEach(([k, v]) => expect(String(v).trim(), `en ${k}`).not.toBe(''));
    Object.entries({ ...he }).forEach(([k, v]) => expect(String(v).trim(), `he ${k}`).not.toBe(''));
  });
  it('Hebrew texts keep the same {placeholders} as English', () => {
    Object.keys(en).forEach((k) => {
      const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
      expect(ph(he[k]), `placeholders of ${k}`).toBe(ph(en[k]));
    });
  });
  it('every literal t(...) / titleKey / label key used in the code exists', () => {
    const used = new Set();
    srcFiles.forEach((f) => {
      const code = read(f);
      [...code.matchAll(/\bt\('([^']+)'/g), ...code.matchAll(/\bt\("([^"]+)"/g), ...code.matchAll(/titleKey="([^"]+)"/g), ...code.matchAll(/label: '([a-z]+\.[^']+)'/g)]
        .forEach((m) => used.add(m[1]));
    });
    const missing = [...used].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });
  it('every text family built with a template (t(`prefix.${x}`)) is complete', () => {
    const families = {
      'status.': GAME_STATUSES, 'round.': GAME_ROUNDS, 'bq.type.': BONUS_TYPES, 'bq.cat.': ['general', 'season', 'month', 'ranking'],
      'lb.tab.': ['total', 'games', 'bonus', 'jokers', 'stats'], 'h2h.tab.': ['league', 'knockout', 'fun'], 'tabs.': ['games', 'week', 'bonus'],
      'ah.tab.': ['tournament', 'fun'], 'al.view.': ['actions', 'errors'], 'results.tab.': ['live', 'finished', 'bonus'], 'home.hi.': ['morning', 'afternoon', 'evening', 'night'], 'mp.tab.': ['games', 'bonus'], 'bq.tab.': ['questions', 'players', 'missing'], 'rm.tab.': ['games', 'bonus'], 'ah.status.': ['league', 'knockout', 'finished'],
      'ah.tb.': ['exactHits', 'uniqueHits', 'seed'], 'tb.': ['total', 'exactHits', 'uniqueHits', 'bonus'],
      'pred.err.': ['locked', 'closed', 'not-found', 'not-counted', 'teams-tbd', 'invalid-score', 'tie', 'joker-limit', 'joker-needs-pick'],
      'bq.err.': ['locked', 'answered', 'not-found', 'not-supported', 'invalid-answer', 'too-many'],
    };
    const missing = Object.entries(families).flatMap(([p, list]) => list.map((x) => `${p}${x}`)).filter((k) => !(k in en));
    expect(missing).toEqual([]);
    // and the code really builds these prefixes (so a renamed family can't slip through)
    const templates = new Set();
    srcFiles.forEach((f) => [...read(f).matchAll(/\bt\(`([a-zA-Z.]+\.)\$\{/g)].forEach((m) => templates.add(m[1])));
    templates.forEach((p) => expect(Object.keys(families), `unchecked family ${p}`).toContain(p));
  });
});

describe('right-to-left safety', () => {
  const css = read('src/styles.css');
  it('no physical left/right CSS properties (use logical ones: margin-inline-start, inset-inline, text-align: start/end)', () => {
    const bad = [...css.matchAll(/(^|[;{\s])((margin|padding|border)-(left|right)|float|text-align:\s*(left|right)|left|right)\s*[:]/gm)].map((m) => m[0].trim());
    expect(bad).toEqual([]);
  });
});

describe('repository hygiene', () => {
  it('.env files are git-ignored and no real secret-looking values are committed', () => {
    const ignore = read('.gitignore');
    expect(ignore).toMatch(/^\.env$/m);
    expect(ignore).toMatch(/functions\/\.env/);
    ['.env.example', 'functions/.env.example'].forEach((f) => {
      if (existsSync(join(root, f))) expect(read(f)).not.toMatch(/AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN/);
    });
    srcFiles.forEach((f) => expect(read(f), f).not.toMatch(/AIza[0-9A-Za-z_-]{30,}|-----BEGIN (RSA |EC )?PRIVATE KEY/));
  });
  it('the client never imports server-only code', () => {
    srcFiles.forEach((f) => expect(read(f), f).not.toMatch(/firebase-admin|firebase-functions\/v2/));
  });
});
