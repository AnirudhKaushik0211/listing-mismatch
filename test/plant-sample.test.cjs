'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { plantSet, plantOne, replaceRuns, CAN } = require('../src/plant.cjs');
const { buildSample, stopRules, toListing } = require('../src/sample.cjs');
const sets = require('../src/sets.cjs');
const { mulberry32 } = require('../src/prng.cjs');
const { colourFamily } = require('../src/colour.cjs');
const L = (id, category, title, attrs) => ({ id, set: null, category, title, attributes: { colour: null, item_type: 'shoes', material: null, pattern: null, pack_count: null, ...attrs }, image: 'x', imageSha256: 'h' + id, planted: null });
test('replaceRuns replaces maximal colour runs and keeps case style', () => {
  const NAMES = require('../src/colour.cjs').NAMES;
  const r = replaceRuns('Men NAVY BLUE Shoes with blue sole', (w) => NAMES[w] === 'blue', 'red');
  assert.strictEqual(r.title, 'Men RED Shoes with red sole');
  assert.strictEqual(replaceRuns('Navy Blue Shoe', (w) => NAMES[w] === 'blue', 'red').title, 'Red Shoe');
});
test('plant: deterministic, one attribute changed, title consistent, strata honoured', () => {
  const ls = [L('A1', 'SHOES', 'Acme Navy Blue Leather Shoes', { colour: 'Navy Blue', material: 'Leather' }), L('A2', 'CHAIR', 'Nice Red Dining Chair', { colour: 'Red', item_type: 'chair' }), L('A3', 'TABLE', 'Oak Table', { colour: 'Brown', item_type: 'table' })];
  const job = [{ listing: ls[0], cond: 'colour-far' }, { listing: ls[1], cond: 'colour-near' }, { listing: ls[2], cond: 'control' }];
  const r1 = plantSet(job, 'planted-dev'), r2 = plantSet(job, 'planted-dev');
  assert.deepStrictEqual(r1, r2);
  const a1 = r1.listings.find((l) => l.id === 'A1'), a2 = r1.listings.find((l) => l.id === 'A2'), a3 = r1.listings.find((l) => l.id === 'A3');
  assert.strictEqual(a1.planted.stratum, 'far'); assert.strictEqual(a2.planted.stratum, 'near');
  const { NEAR } = require('../src/colour.cjs');
  assert.ok(!NEAR.blue.includes(colourFamily(a1.attributes.colour)) && colourFamily(a1.attributes.colour) !== 'blue');
  assert.ok(NEAR.red.includes(colourFamily(a2.attributes.colour)));
  assert.ok(a1.title.includes(a1.attributes.colour) && !/navy|blue/i.test(a1.title));
  assert.strictEqual(a1.attributes.item_type, 'shoes'); assert.strictEqual(a1.attributes.material, 'Leather'); // exactly one attribute changed
  assert.strictEqual(a3.planted, null); assert.strictEqual(a3.title, 'Oak Table');
  assert.strictEqual(r1.log.length, 2); assert.ok(r1.log.every((l) => l.titleRewritten === true));
  assert.strictEqual(r1.log[0].set, 'planted-dev');
});
test('plant: ineligible listings are skipped (no source-family word in title, multicolour, no target)', () => {
  assert.strictEqual(CAN['colour-far'](L('B1', 'SHOES', 'Plain Shoes', { colour: 'Red' })), false);
  assert.strictEqual(CAN['colour-far'](L('B2', 'SHOES', 'Red Blue Shoes', { colour: 'Red/Blue' })), false);
  assert.strictEqual(CAN['item-type'](L('B3', 'SHOES', 'Red Shoes', { colour: 'Red' })), false); // footwear has no allowed targets
  assert.strictEqual(CAN['item-type'](L('B4', 'CHAIR', 'Oak Chair', {})), true);
  assert.strictEqual(plantOne(L('B5', 'SHOES', 'Plain Shoes', { colour: 'Red' }), 'colour-far', mulberry32(1)), null);
});
const rec = (i, cat, title, colour) => ({ item_id: 'I' + i, product_type: cat, title, colour, material: 'Wood', image_file: 'images/x/' + i + '.jpg', imageSha256: 'hash' + i });
function pool(n) {
  const cats = ['CHAIR', 'TABLE', 'SOFA', 'SHOES'], out = [];
  for (let i = 0; i < n; i++) { const c = cats[i % 4]; out.push(rec(i, c, `Brand Red ${c.toLowerCase() === 'shoes' ? 'Shoes' : c[0] + c.slice(1).toLowerCase()} number ${i}`, 'Red')); }
  return out;
}
const SMALL = { 'natural-heldout': { natural: 8 }, 'natural-dev': { natural: 4 }, 'planted-heldout': { 'colour-far': 4, 'colour-near': 4, 'item-type': 6, material: 4, pattern: 0, control: 8 }, 'planted-dev': { 'colour-far': 2, 'colour-near': 0, 'item-type': 3, material: 2, pattern: 0, control: 4 } };
test('sample: deterministic, disjoint, stratified, shortfalls recorded, stop rules', () => {
  const p = pool(120);
  const a = buildSample(p, { sizes: SMALL }), b = buildSample(p, { sizes: SMALL });
  assert.deepStrictEqual(a, b);
  const ids = Object.values(a.sets).flat().map((l) => l.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.strictEqual(a.sets['natural-heldout'].length, 8);
  const cats = a.sets['natural-heldout'].map((l) => l.category);
  assert.ok(['CHAIR', 'TABLE', 'SOFA', 'SHOES'].every((c) => cats.filter((x) => x === c).length === 2)); // equal quota per category
  assert.ok(a.sets['planted-heldout'].filter((l) => l._cond === 'item-type').every((l) => l.category !== 'SHOES')); // footwear has no item-type targets
  assert.ok(stopRules({ eligible: { 'colour-far': 10, 'item-type': 200 }, counts: {} }, null, {}).some((s) => s.startsWith('S3')));
  const big = buildSample(pool(20), { sizes: SMALL });
  assert.ok(stopRules(big.report, null, SMALL).some((s) => s.startsWith('S5')));
  assert.ok(toListing(p[0]).attributes.item_type);
});
test('sets: dev loaders refuse held-out names without the capability; capability needs verified freeze', () => {
  for (const n of ['natural-heldout', 'planted-heldout']) {
    assert.throws(() => sets.loadSet(n), /capability/); assert.throws(() => sets.loadPlantingLog(n), /capability/); assert.throws(() => sets.loadLabels(n), /capability/);
  }
  assert.throws(() => sets.makeRunnerCapability({ freezeVerified: false }), /freeze/);
  assert.throws(() => sets.makeRunnerCapability(null));
  assert.throws(() => sets.loadSet('nope'), /unknown set/);
  assert.ok(Object.freeze(sets.makeRunnerCapability({ freezeVerified: true })));
});
test('mock refuses held-out sets and records without mockTruth (exit code 2)', () => {
  const mock = require('../src/vlm/mock.cjs');
  assert.throws(() => mock.check({ listing: { id: 'x', set: 'planted-heldout', mockTruth: {} }, requested: ['colour'] }), (e) => e.exitCode === 2);
  assert.throws(() => mock.check({ listing: { id: 'x', set: 'planted-dev' }, requested: ['colour'] }), (e) => e.exitCode === 2);
});