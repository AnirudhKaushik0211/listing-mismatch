'use strict';
// Text-only consistency baseline (SPEC 5.2). No image.
const { colourFamily, titleColourWords } = require('../colour.cjs');
const LEX = require('../lexicon.json');
const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const mk = (verdict, reason) => ({ verdict, confidence: 1, reason, flags: [] });
function typeKeyOfDisplay(d) { return Object.keys(LEX.itemTypes).find((k) => LEX.itemTypes[k].display === String(d).toLowerCase()) || null; }
function titleTypes(title) {
  const ws = new Set(words(title));
  return Object.keys(LEX.itemTypes).filter((k) => LEX.itemTypes[k].nouns.some((n) => ws.has(n)));
}
function familyOf(table, value) {
  const raw = String(value || '').toLowerCase();
  const ws = words(raw);
  for (const [fam, list] of Object.entries(table)) if (list.some((t) => (t.includes(' ') ? raw.includes(t) : ws.includes(t)))) return fam;
  return null;
}
const materialFamily = (v) => familyOf(LEX.materials, v);
const patternFamily = (v) => familyOf(LEX.patterns, v);
function parsePackCount(title) {
  const t = String(title || '').toLowerCase();
  const found = new Set();
  let m;
  const r1 = /(pack|set|lot|combo|bundle)\s+of\s+(\d{1,2})/g;
  while ((m = r1.exec(t))) found.add(Number(m[2]));
  const r2 = /(\d{1,2})\s*[- ]?\s*(pack|pcs|pieces?|count|piece set)/g;
  while ((m = r2.exec(t))) found.add(Number(m[1]));
  const v = [...found].filter((n) => n >= 2 && n <= 20);
  return found.size === 1 && v.length === 1 ? v[0] : null;
}
function checkAttr(listing, name) {
  const a = listing.attributes, title = listing.title;
  if (name === 'colour') {
    const fam = colourFamily(a.colour);
    const tw = titleColourWords(title);
    if (!tw.length || !fam || fam === 'multicolour') return mk('cannot_tell', 'no comparable colour word');
    return tw.some((x) => x.f === fam) ? mk('match', 'title colour agrees') : mk('mismatch', 'title colour word differs from the colour attribute');
  }
  if (name === 'item_type') {
    const key = typeKeyOfDisplay(a.item_type);
    const tt = titleTypes(title);
    if (!tt.length || !key) return mk('cannot_tell', 'no item-type word in title');
    return tt.includes(key) ? mk('match', 'title type agrees') : mk('mismatch', 'title item-type word differs from the item_type attribute');
  }
  if (name === 'pack_count') {
    const n = parsePackCount(title);
    if (n === null) return mk('cannot_tell', 'no pack count in title');
    return n === Number(a.pack_count) ? mk('match', 'title count agrees') : mk('mismatch', 'title pack count differs from the attribute');
  }
  const fn = name === 'material' ? materialFamily : patternFamily;
  const table = name === 'material' ? LEX.materials : LEX.patterns;
  const fam = fn(a[name]);
  if (!fam) return mk('cannot_tell', 'value not mappable');
  const titleFams = Object.keys(table).filter((f) => table[f].some((t) => (t.includes(' ') ? String(title).toLowerCase().includes(t) : words(title).includes(t))));
  if (!titleFams.length) return mk('cannot_tell', 'no ' + name + ' word in title');
  return titleFams.includes(fam) ? mk('match', 'title agrees') : mk('mismatch', 'title ' + name + ' word differs from the attribute');
}
function checkListing(listing) {
  const attributes = {};
  for (const k of ['colour', 'item_type', 'material', 'pattern', 'pack_count']) if (listing.attributes[k] !== null && listing.attributes[k] !== undefined) attributes[k] = checkAttr(listing, k);
  return { id: listing.id, checker: 'baseline-text', provider: 'none', model: 'none', promptHash: null, attributes, usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0, error: null };
}
module.exports = { checkListing, checkAttr, parsePackCount, materialFamily, patternFamily, titleTypes, typeKeyOfDisplay, words };