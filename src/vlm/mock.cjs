'use strict';
// Deterministic mock. Never looks at pixels. Reads listing.mockTruth, which exists only in fixture records.
const { mulberry32, hashSeed } = require('../prng.cjs');
const HELDOUT = new Set(['planted-heldout', 'natural-heldout']);
class MockRefusal extends Error { constructor(m) { super(m); this.exitCode = 2; } }
const VERDICTS = ['match', 'mismatch', 'cannot_tell'];
function check(a) {
  const l = a.listing;
  if (!l || !l.mockTruth) throw new MockRefusal('mock refuses a listing without mockTruth (it would have to read real ground truth)');
  if (HELDOUT.has(l.set)) throw new MockRefusal('mock refuses held-out sets');
  const acc = a.mockAccuracy === undefined ? 0.9 : a.mockAccuracy;
  const rnd = mulberry32(hashSeed(l.id, 20250104));
  const attrs = {};
  for (const name of a.requested) {
    const truth = l.mockTruth[name] || 'cannot_tell';
    let v = truth;
    if (rnd() >= acc) { const others = VERDICTS.filter((x) => x !== truth); v = others[Math.floor(rnd() * others.length)]; }
    const conf = Math.round((0.55 + rnd() * 0.44) * 100) / 100;
    attrs[name] = { verdict: v, confidence: conf, reason: v === 'mismatch' ? 'mock: listed value differs from the image' : v === 'match' ? 'mock: value consistent with the image' : 'mock: not judgeable from the image' };
  }
  return { rawText: JSON.stringify({ attributes: attrs }), usage: { inputTokens: 900, outputTokens: 80 }, latencyMs: 1 };
}
module.exports = { check, name: 'mock', MockRefusal, HELDOUT };