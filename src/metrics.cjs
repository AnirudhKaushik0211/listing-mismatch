'use strict';
// Confusion counts, precision/recall/F1, rates, per-slice tables (SPEC 8). Planted truth comes only from `planted`.
const { effective } = require('./core/verdict.js');
const { wilson, kappa, bootstrap, quantile } = require('./stats.cjs');
const ATTRS = ['colour', 'item_type', 'material', 'pattern', 'pack_count'];
const GATE_ATTRS = ['colour', 'item_type', 'material'];
const MISSING = { verdict: 'cannot_tell', confidence: 0, reason: '', flags: ['missing'] };
const attrOf = (rec, name, tau) => effective((rec && rec.attributes && rec.attributes[name]) || MISSING, tau);
const nz = (v) => v !== null && v !== undefined && v !== '';
const nonNull = (l) => ATTRS.filter((a) => nz(l.attributes[a]));

// Planted ground truth: 'mismatch', 'not_mismatch', or null (excluded: near-stratum swapped colour pair).
function plantedTruth(listing, attr) {
  const pl = listing.planted;
  if (pl && pl.attribute === attr) return attr === 'colour' && pl.stratum === 'near' ? null : 'mismatch';
  return 'not_mismatch';
}
function plantedPairs(listings, vmap, tau, attrs = ATTRS) {
  const out = [];
  for (const l of listings) for (const a of nonNull(l)) {
    if (!attrs.includes(a)) continue;
    const truth = plantedTruth(l, a);
    if (truth === null) continue;
    out.push({ id: l.id, attr: a, truth, pred: attrOf(vmap.get(l.id), a, tau).verdict, category: l.category, stratum: l.planted && l.planted.attribute === a ? l.planted.stratum : null });
  }
  return out;
}
function ratio(a, b) { return b > 0 ? a / b : null; }
function counts(pairs) {
  let tp = 0, fp = 0, fn = 0, tn = 0, ct = 0;
  for (const p of pairs) {
    const pos = p.truth === 'mismatch', flag = p.pred === 'mismatch';
    if (pos && flag) tp++; else if (!pos && flag) fp++; else if (pos && !flag) fn++; else tn++;
    if (p.pred === 'cannot_tell') ct++;
  }
  const precision = ratio(tp, tp + fp), recall = ratio(tp, tp + fn);
  const f1 = 2 * tp + fp + fn > 0 ? (2 * tp) / (2 * tp + fp + fn) : null; // equals 2PR/(P+R) when both are defined
  const n = pairs.length;
  return { n, tp, fp, fn, tn, precision, recall, f1, cannotTell: wilson(ct, n), precisionCI: wilson(tp, tp + fp), recallCI: wilson(tp, tp + fn) };
}
function slice(pairs, keyFn) {
  const groups = {};
  for (const p of pairs) { const k = keyFn(p); if (k === null || k === undefined) continue; (groups[k] = groups[k] || []).push(p); }
  return Object.fromEntries(Object.keys(groups).sort().map((k) => [k, counts(groups[k])]));
}
const f1Of = (tp, fp, fn) => (2 * tp + fp + fn > 0 ? (2 * tp) / (2 * tp + fp + fn) : null);

function plantedMetrics({ listings, checkers, tau, truthIsOnlyPlanted = true }) {
  void truthIsOnlyPlanted;
  const out = { listings: listings.length, byChecker: {} };
  for (const [name, vmap] of Object.entries(checkers)) {
    const pairs = plantedPairs(listings, vmap, tau);
    const perAttr = {};
    const own = name === 'baseline-colour' ? ['colour'] : ATTRS;
    for (const a of own) { const ap = pairs.filter((p) => p.attr === a); if (ap.length) perAttr[a] = { ...counts(ap), byCategory: slice(ap, (p) => p.category), byStratum: slice(ap, (p) => p.stratum) }; }
    out.byChecker[name] = perAttr;
  }
  const vlm = checkers.vlm;
  if (vlm) {
    const col = plantedPairs(listings, vlm, tau, ['colour']);
    const it = plantedPairs(listings, vlm, tau, ['item_type']);
    out.colourFar = counts(col);
    out.itemType = counts(it);
    out.g03 = wilson(col.concat(it).filter((p) => p.pred === 'cannot_tell').length, col.length + it.length);
    out.g03.rate = out.g03.p;
    if (checkers['baseline-colour']) {
      const base = plantedPairs(listings, checkers['baseline-colour'], tau, ['colour']);
      // Per-listing contributions for the paired bootstrap (baseline cannot_tell on a positive is a miss).
      const unit = new Map();
      const add = (pairs, key) => { for (const p of pairs) { const u = unit.get(p.id) || { v: [0, 0, 0], b: [0, 0, 0] }; const pos = p.truth === 'mismatch', fl = p.pred === 'mismatch'; if (pos && fl) u[key][0]++; else if (!pos && fl) u[key][1]++; else if (pos && !fl) u[key][2]++; unit.set(p.id, u); } };
      add(col, 'v'); add(base, 'b');
      const units = [...unit.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map((e) => e[1]);
      const stat = (s) => { const t = { v: [0, 0, 0], b: [0, 0, 0] }; for (const u of s) for (let i = 0; i < 3; i++) { t.v[i] += u.v[i]; t.b[i] += u.b[i]; } const a = f1Of(...t.v), b = f1Of(...t.b); return a === null || b === null ? null : a - b; };
      const bs = bootstrap(units, stat);
      const baseCounts = counts(base);
      out.g04 = { vlmF1: out.colourFar.f1, baselineF1: baseCounts.f1, diff: out.colourFar.f1 !== null && baseCounts.f1 !== null ? out.colourFar.f1 - baseCounts.f1 : null, lo: bs.lo, hi: bs.hi, bootstrapResamples: bs.B };
    }
  }
  // Planted near-stratum colour swaps are reported separately (excluded from gate tables).
  const near = listings.filter((l) => l.planted && l.planted.attribute === 'colour' && l.planted.stratum === 'near');
  out.nearColour = {};
  for (const [name, vmap] of Object.entries(checkers)) out.nearColour[name] = { n: near.length, flagged: near.filter((l) => attrOf(vmap.get(l.id), 'colour', tau).verdict === 'mismatch').length };
  // Planted swaps whose title was not rewritten are "text conflict possible" (material, pattern); counted only when a log is given.
  return out;
}

// Natural set. labelState: {id: {attr: {verdict, tag, note}}}
function naturalMetrics({ listings, labelState, checkers, tau }) {
  const labelled = listings.filter((l) => labelState && labelState[l.id] && nonNull(l).every((a) => labelState[l.id][a]));
  const n = labelled.length;
  if (!n) return { measured: false, reason: 'no complete owner labels' };
  const lab = (l, a) => labelState[l.id][a].verdict;
  const k = labelled.filter((l) => nonNull(l).some((a) => lab(l, a) === 'mismatch')).length;
  const c = labelled.filter((l) => !nonNull(l).some((a) => lab(l, a) === 'mismatch') && nonNull(l).some((a) => lab(l, a) === 'cannot_tell')).length;
  const out = { measured: true, listings: n, rate: wilson(k, n), rateLower: wilson(k, n), rateUpperReading: wilson(k + c, n), cannotTellOnlyListings: c, perAttributeRate: {}, byChecker: {} };
  for (const a of ATTRS) {
    let mm = 0, mt = 0;
    for (const l of labelled) if (nz(l.attributes[a])) { const v = lab(l, a); if (v === 'mismatch') mm++; if (v === 'mismatch' || v === 'match') mt++; }
    if (mt) out.perAttributeRate[a] = wilson(mm, mt);
  }
  const byCat = {};
  for (const l of labelled) { const e = (byCat[l.category] = byCat[l.category] || { k: 0, n: 0 }); e.n++; if (nonNull(l).some((a) => lab(l, a) === 'mismatch')) e.k++; }
  out.rateByCategory = Object.fromEntries(Object.keys(byCat).sort().map((c2) => [c2, wilson(byCat[c2].k, byCat[c2].n)]));
  // Tags
  const tags = {}; let tagged = 0, untagged = 0;
  for (const l of labelled) for (const a of nonNull(l)) { const e = labelState[l.id][a]; if (e.verdict !== 'mismatch') continue; if (e.tag) { tagged++; (tags[e.tag] = tags[e.tag] || { count: 0, examples: [] }).count++; if (tags[e.tag].examples.length < 3) tags[e.tag].examples.push(l.id); } else untagged++; }
  out.tags = { tagged, untagged, byTag: Object.fromEntries(Object.keys(tags).sort().map((t) => [t, { ...tags[t], share: wilson(tags[t].count, tagged) }])) };
  const gatePairs = [];
  for (const l of labelled) for (const a of GATE_ATTRS) if (nz(l.attributes[a])) gatePairs.push({ id: l.id, attr: a, owner: lab(l, a) });
  for (const [name, vmap] of Object.entries(checkers)) {
    const perAttr = {};
    for (const a of ATTRS) {
      const pairs = [];
      for (const l of labelled) if (nz(l.attributes[a])) { const o = lab(l, a); if (o === 'cannot_tell') continue; pairs.push({ id: l.id, attr: a, truth: o === 'mismatch' ? 'mismatch' : 'not_mismatch', pred: attrOf(vmap.get(l.id), a, tau).verdict, category: l.category }); }
      if (pairs.length) perAttr[a] = counts(pairs);
    }
    const flags = gatePairs.filter((p) => attrOf(vmap.get(p.id), p.attr, tau).verdict === 'mismatch');
    const confirmed = flags.filter((p) => p.owner === 'mismatch').length;
    const preds = gatePairs.map((p) => attrOf(vmap.get(p.id), p.attr, tau).verdict);
    const owners = gatePairs.map((p) => p.owner);
    const k3 = kappa(owners, preds);
    const bin = kappa(owners.map((x) => (x === 'mismatch' ? 'm' : 'n')), preds.map((x) => (x === 'mismatch' ? 'm' : 'n')));
    const byListing = {};
    gatePairs.forEach((p, i) => { (byListing[p.id] = byListing[p.id] || []).push([owners[i], preds[i]]); });
    const units = Object.keys(byListing).sort().map((id) => byListing[id]);
    const bsK = bootstrap(units, (s) => { const a = [], b = []; for (const u of s) for (const [o, pr] of u) { a.push(o); b.push(pr); } return kappa(a, b); });
    out.byChecker[name] = { perAttribute: perAttr, flags: flags.length, confirmed, hitRate: ratio(confirmed, flags.length), hitRateCI: wilson(confirmed, flags.length), kappa3: k3, kappaBinary: bin, kappa3CI: { lo: bsK.lo, hi: bsK.hi }, ownerMismatchPairs: owners.filter((x) => x === 'mismatch').length, gatePairs: gatePairs.length, cannotTellRate: wilson(preds.filter((x) => x === 'cannot_tell').length, preds.length) };
  }
  if (out.byChecker.vlm) {
    const v = out.byChecker.vlm;
    out.g05 = { kappa: v.kappa3, ownerMismatch: v.ownerMismatchPairs };
    out.g06 = { flags: v.flags, confirmed: v.confirmed, rate: v.hitRate };
  }
  const tv = checkers['baseline-text'];
  if (tv) out.textDisagreements = labelled.filter((l) => nonNull(l).some((a) => attrOf(tv.get(l.id), a, tau).verdict === 'mismatch')).length;
  return out;
}

function opsMetrics(recordLists) {
  let sent = 0, failures = 0, attrParseErrors = 0;
  for (const recs of recordLists) for (const r of recs) { sent++; if (r.error) failures++; for (const a of Object.values(r.attributes || {})) if ((a.flags || []).includes('parse_error') && !r.error) attrParseErrors++; }
  return { sent, failures, failureRate: sent ? failures / sent : null, attributeParseErrors: attrParseErrors, pooled: true };
}
// Cost and latency (cost.json, not in the hashed metrics). prices: {"provider/model": {inputPerMillion, outputPerMillion}}.
function costMetrics(records, prices, provider, model) {
  const real = records.filter((r) => !r.cached && !r.error);
  const inT = real.reduce((a, r) => a + (r.usage ? r.usage.inputTokens : 0), 0), outT = real.reduce((a, r) => a + (r.usage ? r.usage.outputTokens : 0), 0);
  const lat = real.map((r) => r.latencyMs).sort((a, b) => a - b);
  const pr = prices && prices[provider + '/' + model];
  const cost = pr ? (inT * pr.inputPerMillion + outT * pr.outputPerMillion) / 1e6 : null;
  return { listings: real.length, inputTokens: inT, outputTokens: outT, costUsd: cost, costPer1000: cost !== null && real.length ? (cost / real.length) * 1000 : null, costNote: pr ? 'computed from eval/prices.json' : 'cost: not computed (no eval/prices.json entry)', latencyMs: { p50: quantile(lat, 0.5), p95: quantile(lat, 0.95), mean: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : null } };
}
// tau selection (SPEC 8.2): colour far-stratum pairs of planted-dev only.
function chooseTau(listings, vmap, grid = [0.5, 0.6, 0.7, 0.8, 0.9]) {
  const rows = grid.map((t) => ({ tau: t, ...counts(plantedPairs(listings, vmap, t, ['colour'])) }));
  const ok = rows.filter((r) => r.precision !== null && r.precision >= 0.85);
  if (ok.length) { const best = ok.reduce((a, b) => (b.f1 > a.f1 || (b.f1 === a.f1 && b.tau > a.tau) ? b : a)); return { tau: best.tau, reason: 'max F1 among precision >= 0.85', rows }; }
  const def = rows.filter((r) => r.precision !== null);
  if (!def.length) return { tau: 0.7, reason: 'no defined precision; default 0.7', rows };
  const best = def.reduce((a, b) => (b.precision > a.precision || (b.precision === a.precision && (b.f1 > a.f1 || (b.f1 === a.f1 && b.tau > a.tau))) ? b : a));
  return { tau: best.tau, reason: 'no tau reaches precision 0.85; highest precision chosen', rows };
}
module.exports = { plantedTruth, plantedPairs, counts, slice, plantedMetrics, naturalMetrics, opsMetrics, costMetrics, chooseTau, attrOf, ATTRS, GATE_ATTRS, f1Of };