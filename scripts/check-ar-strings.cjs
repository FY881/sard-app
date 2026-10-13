#!/usr/bin/env node
/**
 * Sard: checks that ar_SA/strings.json has every key of en/strings.json and
 * that no Arabic value is still plain English or mentions "LNReader".
 * Usage: node scripts/check-ar-strings.cjs   (exit 1 on problems)
 */
const path = require('path');
const dir = path.join(__dirname, '../src/i18n/languages');
const en = require(path.join(dir, 'en/strings.json'));
const ar = require(path.join(dir, 'ar_SA/strings.json'));

// Brand / technical tokens allowed to stay Latin on their own.
const ALLOWED_LATIN = new Set(['GitHub', 'TTS', 'EPUB', 'WebView', 'CSS', 'JS']);

const flat = (obj, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flat(v, key, out);
    else out[key] = v;
  }
  return out;
};

const E = flat(en);
const A = flat(ar);
const problems = [];
for (const key of Object.keys(E)) {
  const value = A[key];
  if (value === undefined) {
    problems.push(`missing: ${key}`);
    continue;
  }
  if (typeof value !== 'string') continue;
  if (/LNReader/.test(value)) problems.push(`LNReader: ${key} = ${value}`);
  const text = value.replace(/%\{[^}]*\}/g, '').replace(/<[^>]+>/g, '');
  const hasArabic = /[\u0600-\u06FF]/.test(text);
  const hasLatinWord = /[A-Za-z]{3,}/.test(text);
  if (!hasArabic && hasLatinWord && !ALLOWED_LATIN.has(text.trim())) {
    problems.push(`english: ${key} = ${value}`);
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s) in ar_SA/strings.json`);
  process.exit(1);
}
console.log(
  `ar_SA OK: ${Object.keys(E).length} en keys, all present, none left in English.`,
);
