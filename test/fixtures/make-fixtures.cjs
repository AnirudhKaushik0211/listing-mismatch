'use strict';
// Generates the synthetic fixtures: tiny JPEGs and two small manifests (ids start with FX-, never real ABO ids).
// Run: node test/fixtures/make-fixtures.cjs
const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { bytesHash, canonicalManifest, canonical, sha256 } = require('../../src/hash.cjs');
const DIR = __dirname;
const RGB = { red: [205, 30, 40], blue: [40, 70, 170], green: [40, 140, 60], grey: [128, 128, 128], orange: [240, 130, 30], pink: [240, 130, 170], navy: [20, 30, 90], black: [20, 20, 20] };
function img(name, rgb) {
  const W = 64, H = 64, data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, inside = x >= 14 && x < 50 && y >= 14 && y < 50;
    const c = inside ? rgb : [250, 250, 250];
    data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
  }
  const bytes = jpeg.encode({ data, width: W, height: H }, 92).data;
  fs.mkdirSync(path.join(DIR, 'images'), { recursive: true });
  fs.writeFileSync(path.join(DIR, 'images', name + '.jpg'), bytes);
  return { image: 'images/' + name + '.jpg', imageSha256: bytesHash(bytes) };
}
function rec(id, set, category, title, attrs, photo, extra) {
  const a = { colour: null, item_type: null, material: null, pattern: null, pack_count: null, ...attrs };
  return { id, set, category, title, attributes: a, ...img(id.toLowerCase(), RGB[photo]), planted: null, ...extra };
}
const truthFor = (r) => {
  const t = {};
  for (const [k, v] of Object.entries(r.attributes)) if (v !== null) t[k] = r.planted && r.planted.attribute === k ? 'mismatch' : 'match';
  return t;
};
const P = 'fixture-planted';
const planted = [
  rec('FX-P01', P, 'SHOES', 'Acme Red Leather Shoes', { colour: 'Red', item_type: 'shoes', material: 'Leather' }, 'red'),
  rec('FX-P02', P, 'CHAIR', 'Acme Navy Dining Chair', { colour: 'Navy', item_type: 'chair' }, 'navy'),
  rec('FX-P03', P, 'SOFA', 'Acme Green Sofa', { colour: 'Green', item_type: 'sofa' }, 'green'),
  rec('FX-P04', P, 'TABLE', 'Acme Grey Wood Table', { colour: 'Grey', item_type: 'table', material: 'Wood' }, 'grey'),
  rec('FX-P05', P, 'SHOES', 'Acme Blue Leather Shoes', { colour: 'Blue', item_type: 'shoes', material: 'Leather' }, 'red', { planted: { attribute: 'colour', from: 'Red', to: 'Blue', stratum: 'far' } }),
  rec('FX-P06', P, 'CHAIR', 'Acme Orange Dining Chair', { colour: 'Orange', item_type: 'chair' }, 'green', { planted: { attribute: 'colour', from: 'Green', to: 'Orange', stratum: 'far' } }),
  rec('FX-P07', P, 'SOFA', 'Acme Pink Sofa', { colour: 'Pink', item_type: 'sofa' }, 'red', { planted: { attribute: 'colour', from: 'Red', to: 'Pink', stratum: 'near' } }),
  rec('FX-P08', P, 'CHAIR', 'Acme Black Table', { colour: 'Black', item_type: 'table' }, 'black', { planted: { attribute: 'item_type', from: 'chair', to: 'table', stratum: null } }),
  rec('FX-P09', P, 'TABLE', 'Acme Grey Sofa', { colour: 'Grey', item_type: 'sofa' }, 'grey', { planted: { attribute: 'item_type', from: 'table', to: 'sofa', stratum: null } }),
  rec('FX-P10', P, 'SHOES', 'Acme Red Metal Shoes', { colour: 'Red', item_type: 'shoes', material: 'Metal' }, 'red', { planted: { attribute: 'material', from: 'Leather', to: 'Metal', stratum: null } })
].map((r) => ({ ...r, mockTruth: truthFor(r) }));
const N = 'fixture-natural';
const natural = [
  rec('FX-N01', N, 'SHOES', 'Acme Red Shoes', { colour: 'Red', item_type: 'shoes' }, 'red'),
  rec('FX-N02', N, 'CHAIR', 'Acme Blue Chair', { colour: 'Blue', item_type: 'chair' }, 'orange'),
  rec('FX-N03', N, 'SOFA', 'Acme Grey Sofa, Set of 2', { colour: 'Grey', item_type: 'sofa', pack_count: 2 }, 'grey'),
  rec('FX-N04', N, 'TABLE', 'Acme Black Table', { colour: 'Black', item_type: 'table', material: 'Wood' }, 'black'),
  rec('FX-N05', N, 'SHOES', 'Acme Green Shoes', { colour: 'Green', item_type: 'shoes' }, 'red'),
  rec('FX-N06', N, 'CHAIR', 'Acme Pink Chair', { colour: 'Pink', item_type: 'chair' }, 'pink')
];
const nTruth = { 'FX-N01': { colour: 'match', item_type: 'match' }, 'FX-N02': { colour: 'mismatch', item_type: 'match' }, 'FX-N03': { colour: 'match', item_type: 'match', pack_count: 'match' }, 'FX-N04': { colour: 'match', item_type: 'match', material: 'cannot_tell' }, 'FX-N05': { colour: 'mismatch', item_type: 'match' }, 'FX-N06': { colour: 'match', item_type: 'cannot_tell' } };
natural.forEach((r) => { r.mockTruth = nTruth[r.id]; });
fs.writeFileSync(path.join(DIR, 'fixture-planted.json'), canonicalManifest(planted));
fs.writeFileSync(path.join(DIR, 'fixture-natural.json'), canonicalManifest(natural));
// Synthetic fixture labels (carve-out in SPEC 1.1 rule 2): derived from the table above, never from a model, marked synthetic.
const tasksHash = sha256(canonical({ split: N, ids: natural.map((r) => r.id).sort() }));
const labels = natural.map((r) => ({ id: r.id, attributes: Object.fromEntries(Object.entries(nTruth[r.id]).map(([k, v]) => [k, { verdict: v, tag: v === 'mismatch' ? 'other' : null, note: '' }])) }));
fs.writeFileSync(path.join(DIR, 'natural.fixture-labels.json'), JSON.stringify({ schema: 'listing-mismatch-labels/v1', split: N, tasksHash, labeller: 'fixture', synthetic: true, createdAt: '2000-01-01T00:00:00.000Z', labels }, null, 1) + '\n');
console.log('fixtures written: ' + planted.length + ' planted, ' + natural.length + ' natural');