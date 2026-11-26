'use strict';
// Sample construction: eligibility, deterministic order, stratified quotas, disjoint splits (DATA-PLAN 3 to 5).
const LEX = require('./lexicon.json');
const { sha256 } = require('./hash.cjs');
const { parsePackCount } = require('./baseline/text.cjs');
const { CAN } = require('./plant.cjs');
const SIZES = {
  'natural-heldout': { natural: 200 },
  'natural-dev': { natural: 30 },
  'planted-heldout': { 'colour-far': 60, 'colour-near': 20, 'item-type': 72, material: 36, pattern: 36, control: 160 },
  'planted-dev': { 'colour-far': 14, 'colour-near': 4, 'item-type': 16, material: 10, pattern: 10, control: 36 }
};
const ASSIGN_ORDER = [
  ['natural-heldout', 'natural'], ['natural-dev', 'natural'],
  ...['colour-far', 'colour-near', 'item-type', 'material', 'pattern', 'control'].map((c) => ['planted-heldout', c]),
  ...['colour-far', 'colour-near', 'item-type', 'material', 'pattern', 'control'].map((c) => ['planted-dev', c])
];
const SELECTION_SALT = 'listing-mismatch-v1|';
function toListing(rec) {
  const t = LEX.itemTypes[rec.product_type];
  return {
    id: rec.item_id, set: null, category: rec.product_type, title: rec.title,
    attributes: { colour: rec.colour || null, item_type: t ? t.display : String(rec.product_type).toLowerCase(), material: rec.material || null, pattern: rec.pattern || null, pack_count: parsePackCount(rec.title) },
    image: rec.image_file, imageSha256: rec.imageSha256, planted: null
  };
}
// Split n over categories: equal base, remainders to categories with most candidates.
function allocate(n, cats, candidateCounts) {
  const k = cats.length;
  if (!k) return {};
  const base = Math.floor(n / k);
  const out = Object.fromEntries(cats.map((c) => [c, base]));
  const order = [...cats].sort((a, b) => (candidateCounts[b] || 0) - (candidateCounts[a] || 0));
  for (let i = 0; i < n - base * k; i++) out[order[i % k]]++;
  return out;
}
function buildSample(pool, opts = {}) {
  const sizes = opts.sizes || SIZES;
  const listings = pool.map(toListing).sort((a, b) => { const x = sha256(SELECTION_SALT + a.id), y = sha256(SELECTION_SALT + b.id); return x < y ? -1 : 1; });
  // dedupe by image hash, keeping the first in order
  const seen = new Set();
  const uniq = listings.filter((l) => (seen.has(l.imageSha256) ? false : (seen.add(l.imageSha256), true)));
  const cats = [...new Set(uniq.map((l) => l.category))].sort();
  const used = new Set();
  const out = { 'natural-heldout': [], 'natural-dev': [], 'planted-heldout': [], 'planted-dev': [] };
  const report = { shortfalls: [], counts: {}, eligible: {} };
  for (const c of Object.keys(CAN)) report.eligible[c] = uniq.filter((l) => CAN[c](l)).length;
  for (const [set, cond] of ASSIGN_ORDER) {
    const n = sizes[set][cond] !== undefined ? sizes[set][cond] : sizes[set].natural;
    if (!n) continue;
    const eligCats = cats.filter((c) => uniq.some((l) => l.category === c && !used.has(l.id) && (cond === 'natural' ? true : CAN[cond](l))));
    const counts = Object.fromEntries(eligCats.map((c) => [c, uniq.filter((l) => l.category === c && !used.has(l.id) && (cond === 'natural' ? true : CAN[cond](l))).length]));
    const quota = allocate(n, eligCats, counts);
    let got = 0;
    for (const c of eligCats) {
      let q = quota[c];
      for (const l of uniq) {
        if (q <= 0) break;
        if (l.category !== c || used.has(l.id) || (cond !== 'natural' && !CAN[cond](l))) continue;
        used.add(l.id); out[set].push({ ...l, set, _cond: cond }); q--; got++;
      }
    }
    // top up from other categories (same order) if a category ran short
    if (got < n) for (const l of uniq) { if (got >= n) break; if (used.has(l.id) || (cond !== 'natural' && !CAN[cond](l))) continue; used.add(l.id); out[set].push({ ...l, set, _cond: cond }); got++; }
    const key = `${set}/${cond}`;
    report.counts[key] = got;
    if (got < n) report.shortfalls.push({ set, condition: cond, wanted: n, got });
  }
  return { sets: out, report };
}
// Stop rules S2, S3, S5 (S1 and S4 are checked at fetch time). Returns an array of fired rules.
function stopRules(report, inventory, sizes = SIZES, opts = {}) {
  const fired = [];
  const thr = opts.productTypeMin || 200;
  const types = Object.entries((inventory && inventory.countsByProductType) || {}).filter(([, n]) => n >= thr).length;
  if (inventory && types < 3) fired.push(`S2: fewer than 3 product types with ${thr} eligible candidates`);
  if (report.eligible['colour-far'] < 150) fired.push(`S3: only ${report.eligible['colour-far']} colour-swap candidates (need 150)`);
  if (report.eligible['item-type'] < 130) fired.push(`S3: only ${report.eligible['item-type']} item-type candidates (need 130)`);
  for (const set of Object.keys(sizes)) {
    // Material and pattern quotas are exploratory (DATA-PLAN 4): their shortfall shrinks the quota and is recorded, no stop rule.
    const prot = Object.entries(sizes[set]).filter(([c]) => c !== 'material' && c !== 'pattern');
    const want = prot.reduce((a, [, n]) => a + n, 0);
    const got = prot.reduce((a, [c]) => a + (report.counts[set + '/' + (c)] || 0), 0);
    if (got < want * 0.95) fired.push(`S5: ${set} has ${got} of ${want} listings`);
  }
  return fired;
}
module.exports = { buildSample, stopRules, toListing, allocate, SIZES, ASSIGN_ORDER };