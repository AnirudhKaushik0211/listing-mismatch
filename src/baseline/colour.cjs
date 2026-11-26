'use strict';
// Colour-histogram baseline (SPEC 5.1). Decodes with jpeg-js, tolerant of near shades via the untuned adjacency table.
const jpeg = require('jpeg-js');
const { nearestFamily, colourFamily, adjacent } = require('../colour.cjs');
const DEFAULTS = { fg: 235, share: 0.25 };
function predictedFamilies(bytes, params = DEFAULTS) {
  let img;
  try { img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: false }); } catch (e) { return { error: 'image_error' }; }
  const { width: W, height: H, data } = img;
  const step = Math.max(1, Math.ceil(Math.max(W, H) / 64));
  const counts = {};
  let total = 0, fg = 0;
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const o = (y * W + x) * 3;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      total++;
      if (Math.min(r, g, b) > params.fg) continue;
      fg++;
      const f = nearestFamily(r, g, b);
      counts[f] = (counts[f] || 0) + 1;
    }
  }
  if (!total || fg / total < 0.05) return { error: 'few_foreground' };
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const set = entries.filter(([, c], i) => i === 0 || c / fg >= params.share).map(([f]) => f);
  return { families: set };
}
function checkColour(bytes, colourValue, params = DEFAULTS) {
  const fam = colourFamily(colourValue);
  if (!fam || fam === 'multicolour') return { verdict: 'cannot_tell', confidence: 1, reason: 'listing colour not mappable to one family', flags: [] };
  const p = predictedFamilies(bytes, params);
  if (p.error === 'image_error') return { verdict: 'cannot_tell', confidence: 1, reason: 'image could not be decoded', flags: ['image_error'] };
  if (p.error) return { verdict: 'cannot_tell', confidence: 1, reason: 'too little foreground', flags: [] };
  const ok = p.families.some((f) => adjacent(fam, f));
  return { verdict: ok ? 'match' : 'mismatch', confidence: 1, reason: 'image colours: ' + p.families.join(', '), flags: [] };
}
function checkListing(listing, bytes, params) {
  const attributes = {};
  if (listing.attributes.colour) attributes.colour = checkColour(bytes, listing.attributes.colour, params);
  return { id: listing.id, checker: 'baseline-colour', provider: 'none', model: 'none', promptHash: null, attributes, usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0, error: null };
}
module.exports = { checkColour, checkListing, predictedFamilies, DEFAULTS };