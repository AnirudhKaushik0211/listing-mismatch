'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const M = require('../src/metrics.cjs');
const gate = require('../src/gate.cjs');
const { ROOT } = require('./helpers.cjs');
const L = (id, attrs, planted = null, category = 'SHOES') => ({ id, category, title: 't', attributes: { colour: null, item_type: null, material: null, pattern: null, pack_count: null, ...attrs }, planted });
const V = (id, o) => [id, { id, attributes: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? { verdict: v[0], confidence: v[1], reason: '', flags: [] } : { verdict: v, confidence: 1, reason: '', flags: [] }])) }];
test('confusion counts, n/a handling, cannot_tell accounting, tau, near-stratum exclusion', () => {
  const listings = [
    L('a', { colour: 'Red' }, { attribute: 'colour', from: 'x', to: 'Red', stratum: 'far' }),
    L('b', { colour: 'Red' }, { attribute: 'colour', from: 'x', to: 'Red', stratum: 'far' }),
    L('c', { colour: 'Red' }, { attribute: 'colour', from: 'x', to: 'Red', stratum: 'near' }),
    L('d', { colour: 'Red' }), L('e', { colour: 'Red' }), L('f', { colour: 'Red' })
  ];
  const vm = new Map([V('a', { colour: ['mismatch', 0.9] }), V('b', { colour: ['mismatch', 0.4] }), V('c', { colour: ['mismatch', 0.9] }), V('d', { colour: ['mismatch', 0.9] }), V('e', { colour: 'cannot_tell' }), V('f', { colour: 'match' })]);
  const pairs = M.plantedPairs(listings, vm, 0.7, ['colour']);
  assert.strictEqual(pairs.length, 5); // near pair c excluded
  const c = M.counts(pairs);
  assert.deepStrictEqual([c.tp, c.fp, c.fn, c.tn], [1, 1, 1, 2]); // b: low confidence mismatch -> cannot_tell -> FN
  assert.strictEqual(c.precision, 0.5); assert.strictEqual(c.recall, 0.5);
  assert.strictEqual(c.cannotTell.k, 2); // b (below tau) and e
  const none = M.counts(M.plantedPairs([L('x', { colour: 'Red' })], new Map([V('x', { colour: 'match' })]), 0.7));
  assert.strictEqual(none.precision, null); assert.strictEqual(none.recall, null);
  // planted truth only from `planted`
  assert.strictEqual(M.plantedTruth(L('z', { colour: 'Red' }), 'colour'), 'not_mismatch');
});
test('G04: baseline cannot_tell on a positive is a miss; bootstrap runs', () => {
  const listings = []; const vlm = new Map(), base = new Map();
  for (let i = 0; i < 20; i++) {
    const id = 'p' + i; listings.push(L(id, { colour: 'Red' }, { attribute: 'colour', from: 'x', to: 'Red', stratum: 'far' }));
    vlm.set(...V(id, { colour: ['mismatch', 0.9] })); base.set(...V(id, { colour: i < 5 ? 'mismatch' : 'cannot_tell' }));
  }
  for (let i = 0; i < 20; i++) { const id = 'c' + i; listings.push(L(id, { colour: 'Red' })); vlm.set(...V(id, { colour: 'match' })); base.set(...V(id, { colour: 'match' })); }
  const m = M.plantedMetrics({ listings, checkers: { vlm, 'baseline-colour': base }, tau: 0.7 });
  assert.strictEqual(m.colourFar.recall, 1); assert.strictEqual(m.g04.baselineF1, (2 * 5) / (2 * 5 + 0 + 15));
  assert.ok(m.g04.diff > 0.5 && m.g04.lo > 0);
});
test('natural: owner cannot_tell excluded from P/R, counted as not confirmed in G06; rate with Wilson', () => {
  const listings = [L('1', { colour: 'Red', item_type: 'shoes' }), L('2', { colour: 'Red', item_type: 'shoes' }), L('3', { colour: 'Red', item_type: 'shoes' })];
  const lab = { '1': { colour: { verdict: 'mismatch', tag: 'other' }, item_type: { verdict: 'match' } }, '2': { colour: { verdict: 'cannot_tell' }, item_type: { verdict: 'match' } }, '3': { colour: { verdict: 'match' }, item_type: { verdict: 'match' } } };
  const vm = new Map([V('1', { colour: ['mismatch', 0.9], item_type: 'match' }), V('2', { colour: ['mismatch', 0.9], item_type: 'match' }), V('3', { colour: 'match', item_type: 'match' })]);
  const n = M.naturalMetrics({ listings, labelState: lab, checkers: { vlm: vm }, tau: 0.7 });
  assert.strictEqual(n.rate.k, 1); assert.strictEqual(n.rate.n, 3); assert.strictEqual(n.cannotTellOnlyListings, 1);
  assert.strictEqual(n.byChecker.vlm.flags, 2); assert.strictEqual(n.byChecker.vlm.confirmed, 1); assert.strictEqual(n.byChecker.vlm.hitRate, 0.5);
  assert.deepStrictEqual([n.byChecker.vlm.perAttribute.colour.tp, n.byChecker.vlm.perAttribute.colour.n], [1, 2]);
  assert.strictEqual(M.naturalMetrics({ listings, labelState: null, checkers: {}, tau: 0.7 }).measured, false);
});
test('tau choice follows SPEC 8.2', () => {
  const listings = [], vm = new Map();
  for (let i = 0; i < 4; i++) { listings.push(L('p' + i, { colour: 'R' }, { attribute: 'colour', from: 'x', to: 'R', stratum: 'far' })); vm.set(...V('p' + i, { colour: ['mismatch', 0.95] })); }
  listings.push(L('n1', { colour: 'R' })); vm.set(...V('n1', { colour: ['mismatch', 0.65] }));
  const c = M.chooseTau(listings, vm);
  assert.strictEqual(c.tau, 0.9); // tau 0.7 and above remove the false positive; ties go to the higher value
});
test('gate table equals the SPEC table; thresholds in code', () => {
  const spec = fs.readFileSync(path.join(ROOT, 'docs/SPEC.md'), 'utf8').replace(/\r\n/g, '\n');
  const block = spec.slice(spec.indexOf('<!-- GATE:BEGIN -->'), spec.indexOf('<!-- GATE:END -->'));
  const rows = block.split('\n').filter((l) => /^\| G\d\d /.test(l)).map((l) => l.split('|').slice(1, -1).map((s) => s.trim()));
  assert.strictEqual(rows.length, gate.TABLE.length);
  rows.forEach((r, i) => assert.deepStrictEqual(r, gate.TABLE[i]));
});
const base = () => ({ planted: { colourFar: { precision: 0.9, recall: 0.8 }, itemType: { precision: 0.9, recall: 0.8 }, g03: { rate: 0.1 }, g04: { diff: 0.2, lo: 0.1 } }, natural: { g05: { kappa: 0.7, ownerMismatch: 20 }, g06: { flags: 12, rate: 0.6 } }, ops: { failureRate: 0.0 } });
test('gate: PASS, FAIL, INCONCLUSIVE, NOT EVALUABLE and sub-statuses', () => {
  const pass = gate.evaluate(base(), { repro: true, repo: true });
  assert.strictEqual(pass.overall, 'GATE PASS'); assert.strictEqual(pass.exitCode, 0);
  const m = base(); m.natural.g05.ownerMismatch = 3;
  const inc = gate.evaluate(m, { repro: true, repo: true });
  assert.strictEqual(inc.overall, 'GATE INCONCLUSIVE'); assert.strictEqual(inc.natural, 'INCONCLUSIVE'); assert.strictEqual(inc.planted, 'PASS');
  const f = base(); f.planted.colourFar.recall = 0.69;
  const fail = gate.evaluate(f, { repro: true, repo: true });
  assert.strictEqual(fail.overall, 'GATE FAIL'); assert.strictEqual(fail.criteria[0].status, 'FAIL'); assert.strictEqual(fail.exitCode, 10);
  assert.strictEqual(gate.evaluate(base(), { mock: true }).overall, 'NOT EVALUABLE');
  const na = base(); na.planted.colourFar = { precision: null, recall: 0.9 };
  assert.strictEqual(gate.evaluate(na, { repro: true, repo: true }).criteria[0].status, 'FAIL');
});