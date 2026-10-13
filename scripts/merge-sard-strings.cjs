#!/usr/bin/env node
/**
 * Sard 1.1: merges scripts/sard11-strings.json ({ "a.b": { "ar": "…", "en": "…" } })
 * into src/i18n/languages/{ar_SA,en}/strings.json under the top-level "sard" key.
 * Then run `node scripts/generate-string-types.cjs` to refresh StringMap.
 */
const fs = require('fs');
const path = require('path');
const src = require('./sard11-strings.json');
const dir = path.join(__dirname, '../src/i18n/languages');

const build = lang => {
  const out = {};
  for (const [key, val] of Object.entries(src)) {
    if (!val || typeof val[lang] !== 'string' || !val[lang]) throw new Error(`missing ${lang} for ${key}`);
    const parts = key.split('.');
    let o = out;
    for (const p of parts.slice(0, -1)) {
      if (typeof o[p] === 'string') throw new Error(`key clash at ${key}`);
      o = o[p] = o[p] || {};
    }
    o[parts[parts.length - 1]] = val[lang];
  }
  return out;
};

for (const [lang, folder] of [['ar', 'ar_SA'], ['en', 'en']]) {
  const file = path.join(dir, folder, 'strings.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  json.sard = build(lang);
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
}
console.log(`merged ${Object.keys(src).length} Sard strings into ar_SA + en`);
