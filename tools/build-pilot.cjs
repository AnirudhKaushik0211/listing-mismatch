'use strict';
// Builds demo/pilot.js and demo/pilot-images/ for the Results page from the DEV/PILOT runs only
// (planted-dev run dev-sub1, natural-dev run dev-sub1n). Offline: no model call, no key, no network.
// Held-out sets are refused. The colour baseline is recomputed locally from the images.
// Kept outside scripts/ and src/ on purpose: those folders are part of the frozen code hash.
// Usage: node tools/build-pilot.cjs
const fs = require('fs');
const path = require('path');
const sets = require('../src/sets.cjs');
const M = require('../src/metrics.cjs');
const { wilson } = require('../src/stats.cjs');
const base = require('../src/baseline/colour.cjs');
const ROOT = path.join(__dirname, '..');
const RUNS = [{ run: 'dev-sub1', set: 'planted-dev' }, { run: 'dev-sub1n', set: 'natural-dev' }];
const STAMP = 'PILOT ON PRACTICE (DEV) DATA, NOT THE PRE-REGISTERED EVALUATION; full evaluation in progress';
const TAU = 0.9; // chosen on dev data and frozen at stage 2
for (const r of RUNS) if (sets.isHeldout(r.set) || !/-dev$/.test(r.set)) throw new Error('only dev sets may be used here: ' + r.set);
const readJsonl = (p) => fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const f2 = (x) => (typeof x === 'number' ? x.toFixed(2) : 'n/a');
const frac = (k, n) => { if (!n) return 'n/a (0 of 0)'; const w = wilson(k, n); return `${k}/${n} = ${f2(w.p)} (95% interval ${f2(w.lo)} to ${f2(w.hi)})`; };
const clean = (s) => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const tuning = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval', 'baseline-tuning.json'), 'utf8'));
const params = { fg: tuning.fg, share: tuning.share };
const outImg = path.join(ROOT, 'demo', 'pilot-images');
fs.rmSync(outImg, { recursive: true, force: true });
fs.mkdirSync(outImg, { recursive: true });

function load(r) {
  const run = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval', 'results-private', r.run, 'run.json'), 'utf8'));
  const recs = readJsonl(path.join(ROOT, 'eval', 'results-private', r.run, `${r.set}.vlm.jsonl`));
  const listings = sets.loadSet(r.set).filter((l) => run.ids.includes(l.id));
  const vlm = new Map(recs.map((x) => [x.id, x]));
  const colour = new Map();
  for (const l of listings) colour.set(l.id, base.checkListing(l, fs.readFileSync(path.join(ROOT, 'data', l.image)), params));
  return { run, listings, vlm, colour };
}
const P = load(RUNS[0]);
const N = load(RUNS[1]);
const eff = (rec, a) => M.attrOf(rec, a, TAU);

// ---- planted
const pm = M.plantedMetrics({ listings: P.listings, checkers: { vlm: P.vlm, 'baseline-colour': P.colour }, tau: TAU });
const row = (a, c) => [a, c.tp, c.fp, c.fn, c.tn, frac(c.tp, c.tp + c.fn), frac(c.tp, c.tp + c.fp), frac(c.fp, c.fp + c.tn), frac(c.cannotTell.k, c.cannotTell.n)];
const plantedRows = Object.entries(pm.byChecker.vlm).map(([a, c]) => row(a, c));
const baselineRows = Object.entries(pm.byChecker['baseline-colour']).map(([a, c]) => row(a, c));
const vlmColour = pm.byChecker.vlm.colour, baseColour = pm.byChecker['baseline-colour'].colour;

// ---- natural (owner labels, dev)
const labelFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'labels', 'natural-dev.labels.json'), 'utf8'));
const ownerOf = Object.fromEntries(labelFile.labels.map((l) => [l.id, l.attributes]));
const nonNull = (l) => ['colour', 'item_type', 'material'].filter((a) => l.attributes[a]);
const nat = {};
for (const l of N.listings) for (const a of nonNull(l)) {
  const o = ownerOf[l.id][a].verdict, v = eff(N.vlm.get(l.id), a).verdict;
  const e = (nat[a] = nat[a] || { n: 0, ownerMismatch: 0, vlmFlags: 0, agree: 0, vlmCt: 0, baseAgree: 0, baseN: 0 });
  e.n++; if (o === 'mismatch') e.ownerMismatch++; if (v === 'mismatch') e.vlmFlags++; if (v === 'cannot_tell') e.vlmCt++;
  if (o === v) e.agree++;
  if (a === 'colour') { e.baseN++; if (N.colour.get(l.id).attributes.colour.verdict === o) e.baseAgree++; }
}
const naturalRows = Object.entries(nat).map(([a, e]) => [a, e.n, e.ownerMismatch, e.vlmFlags, frac(e.agree, e.n), frac(e.vlmCt, e.n)]);
const natBaseline = nat.colour ? frac(nat.colour.baseAgree, nat.colour.baseN) : 'n/a';

// ---- examples
let imgCount = 0;
function example(l, d, truth) {
  const rec = d.vlm.get(l.id);
  const file = `${l.id}.jpg`;
  fs.copyFileSync(path.join(ROOT, 'data', l.image), path.join(outImg, file));
  imgCount++;
  const attrs = nonNull(l).map((a) => {
    const raw = rec.attributes[a] || {};
    const e = eff(rec, a);
    const t = truth(l, a);
    return { attribute: a, listed: String(l.attributes[a]), verdict: raw.verdict, confidence: raw.confidence, effective: e.verdict, reason: raw.reason || '', truth: t, colourBaseline: a === 'colour' ? d.colour.get(l.id).attributes.colour.verdict : null };
  });
  return { id: l.id, category: l.category, title: clean(l.title), image: 'pilot-images/' + file, attributes: attrs };
}
const plantedTruth = (l, a) => { const t = M.plantedTruth(l, a); return t === 'mismatch' ? 'planted mismatch' : t === null ? 'planted near-colour swap (excluded from counts)' : 'not changed'; };
const plantedEx = P.listings.map((l) => ({ ...example(l, P, plantedTruth), set: 'planted-dev', planted: l.planted ? `${l.planted.attribute}: ${l.planted.from} -> ${l.planted.to}` : null }));
const naturalEx = N.listings.map((l) => ({ ...example(l, N, (x, a) => 'owner: ' + ownerOf[x.id][a].verdict), set: 'natural-dev', planted: null }));

const out = {
  schema: 'listing-mismatch-pilot/v1', stamp: STAMP,
  run: { provider: 'gemini', model: 'gemini-3.5-flash', modelNote: 'model not pinned by the provider', tau: TAU, plantedRun: RUNS[0].run, naturalRun: RUNS[1].run, promptHash: P.run.promptHash },
  sizes: { planted: P.listings.length, natural: N.listings.length, plantedColourPairs: vlmColour.n },
  baselineParams: params,
  planted: { rows: plantedRows, baselineRows, colour: { vlm: { tp: vlmColour.tp, fp: vlmColour.fp, fn: vlmColour.fn, tn: vlmColour.tn, recall: frac(vlmColour.tp, vlmColour.tp + vlmColour.fn), precision: frac(vlmColour.tp, vlmColour.tp + vlmColour.fp), falseFlag: frac(vlmColour.fp, vlmColour.fp + vlmColour.tn) }, baseline: { tp: baseColour.tp, fp: baseColour.fp, fn: baseColour.fn, tn: baseColour.tn, recall: frac(baseColour.tp, baseColour.tp + baseColour.fn), precision: frac(baseColour.tp, baseColour.tp + baseColour.fp), falseFlag: frac(baseColour.fp, baseColour.fp + baseColour.tn) } } },
  natural: { rows: naturalRows, colourBaselineAgreement: natBaseline },
  examples: plantedEx.concat(naturalEx),
  limits: [
    'Tiny samples: 15 planted listings and 7 natural listings. Every interval is wide and no rate here should be quoted as a result.',
    'The model threshold (tau) and the colour baseline settings were chosen on these same development listings, so these numbers are not an out-of-sample estimate.',
    'Planted swaps are changes made to real listings so the right answer is known. They are an easier test than real listing mistakes.',
    'Natural listings were labelled by one person (the owner). In 3 of the 7 natural listings the owner marked at least one attribute cannot_tell.',
    'Attributes left unchanged in planted listings are assumed correct, but the catalog itself can contain real mistakes, so some false flags may be genuine mismatches.',
    'The model name is not pinned by the provider, so repeated runs can drift. Free-tier limits capped how many listings could be run.',
    'Held-out listings have not been run or opened for this page.'
  ],
  citation: 'Data: Amazon Berkeley Objects (ABO), CC BY 4.0. Collins et al., "ABO: Dataset and Benchmarks for Real-World 3D Object Understanding", CVPR 2022. Images and titles shown are from that public dataset.'
};
fs.writeFileSync(path.join(ROOT, 'demo', 'pilot.js'), '/* GENERATED by tools/build-pilot.cjs from dev runs only. Do not edit. */\nwindow.LISTING_PILOT = ' + JSON.stringify(out) + ';\n');
console.log(`pilot: ${P.listings.length} planted-dev + ${N.listings.length} natural-dev listings, ${imgCount} images, demo/pilot.js written`);
