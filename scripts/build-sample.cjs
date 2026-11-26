'use strict';
// Builds the four splits from data/splits/abo-sample.json. For held-out sets prints counts only, never ids or titles.
const fs = require('fs');
const path = require('path');
const { buildSample, stopRules, SIZES } = require('../src/sample.cjs');
const { canonicalManifest, bytesHash } = require('../src/hash.cjs');
const ROOT = path.join(__dirname, '..');
const accept = process.argv.includes('--accept-shortfall');
const pool = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'splits', 'abo-sample.json'), 'utf8'));
let inventory = null;
try { inventory = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'splits', 'inventory.json'), 'utf8')); } catch (e) { /* optional */ }
const { sets, report } = buildSample(pool);
const fired = stopRules(report, inventory);
// Disjointness (ids and image hashes) across all sets.
const ids = new Set(), hashes = new Set();
for (const s of Object.values(sets)) for (const l of s) { if (ids.has(l.id) || hashes.has(l.imageSha256)) { console.error('sets are not disjoint'); process.exit(2); } ids.add(l.id); hashes.add(l.imageSha256); }
if (fired.length && !accept) {
  console.error('Stop rule fired (nothing written). Re-run with --accept-shortfall only after the owner accepts the deviation:\n' + fired.map((f) => ' - ' + f).join('\n'));
  process.exit(2);
}
const strip = (l) => { const { _cond, ...r } = l; return r; };
const write = (rel, text) => { const p = path.join(ROOT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
write('data/splits/natural-dev.json', canonicalManifest(sets['natural-dev'].map(strip)));
write('data/heldout/natural-heldout.json', canonicalManifest(sets['natural-heldout'].map(strip)));
// Planted sets are written as assignments (originals plus condition); scripts/plant.cjs applies the swaps.
write('data/splits/planted-dev.assigned.json', JSON.stringify(sets['planted-dev'].map((l) => ({ listing: strip(l), cond: l._cond }))));
write('data/heldout/planted-heldout.assigned.json', JSON.stringify(sets['planted-heldout'].map((l) => ({ listing: strip(l), cond: l._cond }))));
const inv = { ...(inventory || {}), build: { sizesWanted: SIZES, countsByCondition: report.counts, eligibleInPool: report.eligible, shortfalls: report.shortfalls, stopRulesFired: fired, acceptedShortfall: fired.length > 0 && accept, poolSize: pool.length } };
write('data/splits/inventory.json', JSON.stringify(inv, null, 1));
console.log('build-sample: counts per set/condition');
for (const [k, v] of Object.entries(report.counts)) console.log(`  ${k}: ${v}`);
if (report.shortfalls.length) console.log('shortfalls: ' + report.shortfalls.map((s) => `${s.set}/${s.condition} ${s.got}/${s.wanted}`).join('; '));
if (fired.length) console.log('stop rules fired but accepted: ' + fired.join(' | '));
void bytesHash;