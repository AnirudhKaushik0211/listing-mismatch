'use strict';
const F = require('./families.json');
function srgbToLab(r, g, b) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const PROTO_LAB = Object.fromEntries(F.families.map((n) => [n, srgbToLab(...F.prototypes[n])]));
function nearestFamily(r, g, b) {
  const lab = srgbToLab(r, g, b);
  let best = null, bd = Infinity;
  for (const n of F.families) {
    const p = PROTO_LAB[n];
    const d = (lab[0] - p[0]) ** 2 + (lab[1] - p[1]) ** 2 + (lab[2] - p[2]) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}
function words(s) { return String(s || '').toLowerCase().split(/[^a-z]+/).filter(Boolean); }
// First matching token; 'multicolour' for multi-colour values; null when unmapped.
function colourFamily(value) {
  const ws = words(value);
  if (!ws.length) return null;
  const raw = String(value).toLowerCase();
  if (F.multi.some((m) => raw.includes(m))) return 'multicolour';
  // Compound values such as "Navy/Tan" name more than one family: treat as multicolour.
  const fams = [...new Set(ws.map((w) => F.names[w]).filter(Boolean))];
  if (fams.length > 1) return 'multicolour';
  return fams[0] || null;
}
// All colour families named by words in a title (in order of appearance).
function titleColourWords(title) {
  return words(title).map((w) => ({ w, f: F.names[w] })).filter((x) => x.f);
}
const ADJ = {};
for (const a of F.families) ADJ[a] = new Set();
for (const a of F.families) for (const b of F.near[a]) { ADJ[a].add(b); ADJ[b].add(a); }
const adjacent = (a, b) => a === b || (ADJ[a] && ADJ[a].has(b));
module.exports = { srgbToLab, nearestFamily, colourFamily, titleColourWords, adjacent, FAMILIES: F.families, NEAR: F.near, NAMES: F.names, words };