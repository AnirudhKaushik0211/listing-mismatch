'use strict';
// Planting procedure (DATA-PLAN 6). Text only; the image is never altered.
const LEX = require('./lexicon.json');
const { colourFamily, FAMILIES, NEAR, NAMES } = require('./colour.cjs');
const { materialFamily, patternFamily } = require('./baseline/text.cjs');
const { mulberry32 } = require('./prng.cjs');
const SEED = 20250102;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function styleLike(orig, repl) {
  if (orig.length > 1 && orig === orig.toUpperCase()) return repl.toUpperCase();
  if (orig.charAt(0) === orig.charAt(0).toUpperCase() && orig.charAt(0) !== orig.charAt(0).toLowerCase()) return cap(repl);
  return repl.toLowerCase();
}
// Replace every maximal run of consecutive words (separated by space, hyphen or slash) for which isSrc(word) holds.
function replaceRuns(title, isSrc, replacement) {
  const re = /[A-Za-z]+/g;
  const toks = [];
  let m;
  while ((m = re.exec(title))) toks.push({ w: m[0], s: m.index, e: m.index + m[0].length });
  let out = '', pos = 0, i = 0, changed = false;
  while (i < toks.length) {
    if (!isSrc(toks[i].w.toLowerCase())) { i++; continue; }
    let j = i;
    while (j + 1 < toks.length && isSrc(toks[j + 1].w.toLowerCase()) && /^[\s\-]+$/.test(title.slice(toks[j].e, toks[j + 1].s))) j++;
    out += title.slice(pos, toks[i].s) + styleLike(toks[i].w, replacement);
    pos = toks[j].e; i = j + 1; changed = true;
  }
  return { title: out + title.slice(pos), changed };
}
const colourWordsOf = (fam) => Object.keys(NAMES).filter((w) => NAMES[w] === fam);
function srcColourFamily(l) {
  const f = colourFamily(l.attributes.colour);
  return f && f !== 'multicolour' ? f : null;
}
function canColour(l) {
  const f = srcColourFamily(l);
  if (!f) return false;
  const isSrc = (w) => NAMES[w] === f;
  return replaceRuns(l.title, isSrc, 'x').changed;
}
function nounsOf(l) { const t = LEX.itemTypes[l.category]; return t ? t.nouns : []; }
function targetsOf(l) { const t = LEX.itemTypes[l.category]; return t ? t.targets.filter((k) => LEX.itemTypes[k]) : []; }
function canItemType(l) {
  if (!targetsOf(l).length) return false;
  const nouns = new Set(nounsOf(l));
  return replaceRuns(l.title, (w) => nouns.has(w), 'x').changed;
}
function canMaterial(l) {
  const f = materialFamily(l.attributes.material);
  return !!f && Object.keys(LEX.materials).includes(f);
}
function canPattern(l) { return !!(l.attributes.pattern && patternFamily(l.attributes.pattern)); }
const CAN = { 'colour-far': canColour, 'colour-near': canColour, 'item-type': canItemType, material: canMaterial, pattern: canPattern, control: () => true };
function similar(pairs, a, b) { return pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a)); }
const clone = (l) => JSON.parse(JSON.stringify(l));
function plantOne(l, cond, rnd) {
  const p = clone(l);
  let rec;
  if (cond === 'colour-far' || cond === 'colour-near') {
    const src = srcColourFamily(l);
    const near = NEAR[src];
    const pool = cond === 'colour-near' ? near : FAMILIES.filter((f) => f !== src && !near.includes(f));
    const to = pool[Math.floor(rnd() * pool.length)];
    const srcFrom = l.attributes.colour;
    const r = replaceRuns(l.title, (w) => NAMES[w] === src, to);
    if (!r.changed || replaceRuns(r.title, (w) => NAMES[w] === src, 'x').changed) return null;
    p.title = r.title; p.attributes.colour = cap(to);
    rec = { attribute: 'colour', from: srcFrom, to: cap(to), stratum: cond === 'colour-near' ? 'near' : 'far', titleRewritten: true };
  } else if (cond === 'item-type') {
    const targets = targetsOf(l);
    const tk = targets[Math.floor(rnd() * targets.length)];
    const t = LEX.itemTypes[tk];
    const nouns = new Set(nounsOf(l));
    const r = replaceRuns(l.title, (w) => nouns.has(w), t.primary);
    if (!r.changed) return null;
    p.title = r.title; p.attributes.item_type = t.display;
    rec = { attribute: 'item_type', from: l.attributes.item_type, to: t.display, stratum: null, titleRewritten: true };
  } else if (cond === 'material') {
    const src = materialFamily(l.attributes.material);
    const pool = Object.keys(LEX.materials).filter((f) => f !== src && !similar(LEX.materialSimilar, src, f));
    const to = pool[Math.floor(rnd() * pool.length)];
    const srcWords = new Set(LEX.materials[src]);
    const r = replaceRuns(l.title, (w) => srcWords.has(w), to);
    p.title = r.title; p.attributes.material = cap(to);
    rec = { attribute: 'material', from: l.attributes.material, to: cap(to), stratum: null, titleRewritten: r.changed };
  } else if (cond === 'pattern') {
    const src = patternFamily(l.attributes.pattern);
    const pool = Object.keys(LEX.patterns).filter((f) => f !== src && !similar(LEX.patternSimilar, src, f));
    const to = pool[Math.floor(rnd() * pool.length)];
    const srcWords = new Set(LEX.patterns[src].filter((x) => !x.includes(' ')));
    const r = replaceRuns(l.title, (w) => srcWords.has(w), to);
    p.title = r.title; p.attributes.pattern = to;
    rec = { attribute: 'pattern', from: l.attributes.pattern, to, stratum: null, titleRewritten: r.changed };
  } else throw new Error('unknown condition ' + cond);
  p.planted = { attribute: rec.attribute, from: rec.from, to: rec.to, stratum: rec.stratum };
  return { listing: p, log: { id: l.id, attribute: rec.attribute, from: rec.from, to: rec.to, stratum: rec.stratum, titleRewritten: rec.titleRewritten, titleBefore: l.title, titleAfter: p.title } };
}
// assigned: array of {listing, cond}. Targets are drawn sequentially in sorted id order with the fixed seed.
function plantSet(assigned, setName) {
  const rnd = mulberry32(SEED);
  const sorted = [...assigned].sort((a, b) => (a.listing.id < b.listing.id ? -1 : 1));
  const listings = [], log = [];
  for (const { listing, cond } of sorted) {
    if (cond === 'control') { const c = clone(listing); c.set = setName; c.planted = null; listings.push(c); continue; }
    const r = plantOne(listing, cond, rnd);
    if (!r) throw new Error('planting failed for an eligible listing; eligibility and planting disagree');
    r.listing.set = setName; r.log.set = setName;
    listings.push(r.listing); log.push(r.log);
  }
  return { listings, log };
}
module.exports = { plantSet, plantOne, replaceRuns, CAN, SEED, styleLike };