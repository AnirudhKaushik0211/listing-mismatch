'use strict';
const test = require('node:test');
const assert = require('node:assert');
const colourBase = require('../src/baseline/colour.cjs');
const text = require('../src/baseline/text.cjs');
const { solidJpeg } = require('./helpers.cjs');
test('colour baseline: solid red and navy on white, adjacency tolerance, tiny foreground, corrupt bytes', () => {
  const red = solidJpeg([205, 30, 40]), navy = solidJpeg([20, 30, 90]);
  assert.strictEqual(colourBase.checkColour(red, 'Red').verdict, 'match');
  assert.strictEqual(colourBase.checkColour(red, 'Blue').verdict, 'mismatch');
  assert.strictEqual(colourBase.checkColour(navy, 'Navy Blue').verdict, 'match');
  assert.strictEqual(colourBase.checkColour(navy, 'Black').verdict, 'match'); // black is in the near set of blue: tolerated
  assert.strictEqual(colourBase.checkColour(red, 'Pink').verdict, 'match'); // near set of red
  assert.strictEqual(colourBase.checkColour(red, 'Green').verdict, 'mismatch');
  assert.strictEqual(colourBase.checkColour(red, 'Multicolor').verdict, 'cannot_tell');
  const white = solidJpeg([252, 252, 252], [250, 250, 250], false);
  assert.strictEqual(colourBase.checkColour(white, 'Red').verdict, 'cannot_tell');
  const bad = colourBase.checkColour(Buffer.from('not a jpeg'), 'Red');
  assert.strictEqual(bad.verdict, 'cannot_tell'); assert.deepStrictEqual(bad.flags, ['image_error']);
});
const mk = (title, attrs) => ({ id: 'x', title, attributes: { colour: null, item_type: null, material: null, pattern: null, pack_count: null, ...attrs } });
test('text baseline rules', () => {
  const c = (t, a, k) => text.checkAttr(mk(t, a), k).verdict;
  assert.strictEqual(c('Red Shoes', { colour: 'Blue' }, 'colour'), 'mismatch');
  assert.strictEqual(c('Red Shoes', { colour: 'Crimson' }, 'colour'), 'match');
  assert.strictEqual(c('Plain Shoes', { colour: 'Blue' }, 'colour'), 'cannot_tell');
  assert.strictEqual(c('Oak Table', { item_type: 'chair' }, 'item_type'), 'mismatch');
  assert.strictEqual(c('Oak Table', { item_type: 'table' }, 'item_type'), 'match');
  assert.strictEqual(c('Oak Thing', { item_type: 'table' }, 'item_type'), 'cannot_tell');
  assert.strictEqual(c('Set of 4 Chairs', { pack_count: 6 }, 'pack_count'), 'mismatch');
  assert.strictEqual(c('Set of 4 Chairs', { pack_count: 4 }, 'pack_count'), 'match');
  assert.strictEqual(c('Chairs', { pack_count: 4 }, 'pack_count'), 'cannot_tell');
  assert.strictEqual(c('Leather Boots', { material: 'Metal' }, 'material'), 'mismatch');
  assert.strictEqual(c('Striped Rug', { pattern: 'floral' }, 'pattern'), 'mismatch');
  assert.strictEqual(text.parsePackCount('Pack of 3 and 3-pack'), 3);
  assert.strictEqual(text.parsePackCount('Pack of 3 or 5 pcs'), null);
});
test('text baseline finds nothing on consistently planted colour and item-type swaps (by construction)', () => {
  const { plantOne } = require('../src/plant.cjs');
  const { mulberry32 } = require('../src/prng.cjs');
  const l = { id: 'Z', category: 'CHAIR', title: 'Acme Navy Dining Chair', attributes: { colour: 'Navy', item_type: 'chair', material: null, pattern: null, pack_count: null }, planted: null };
  for (const cond of ['colour-far', 'colour-near', 'item-type']) {
    const p = plantOne(l, cond, mulberry32(7)).listing;
    const r = text.checkListing(p).attributes;
    assert.ok(Object.values(r).every((a) => a.verdict !== 'mismatch'), cond + ' ' + JSON.stringify(r));
  }
});