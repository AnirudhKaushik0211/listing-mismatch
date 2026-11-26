'use strict';
const { mulberry32 } = require('./prng.cjs');
const Z = 1.959964;
function wilson(k, n) {
  if (!n) return { p: null, lo: null, hi: null, k, n };
  const p = k / n, z2 = Z * Z;
  const d = 1 + z2 / n;
  const c = p + z2 / (2 * n);
  const h = Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { p, lo: Math.max(0, (c - h) / d), hi: Math.min(1, (c + h) / d), k, n };
}
// Cohen's kappa for two equal-length arrays of class labels. Returns null when pe = 1 or empty.
function kappa(a, b) {
  const n = a.length;
  if (!n || n !== b.length) return null;
  const classes = [...new Set([...a, ...b])];
  let agree = 0;
  const ca = {}, cb = {};
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) agree++;
    ca[a[i]] = (ca[a[i]] || 0) + 1;
    cb[b[i]] = (cb[b[i]] || 0) + 1;
  }
  const po = agree / n;
  let pe = 0;
  for (const c of classes) pe += ((ca[c] || 0) / n) * ((cb[c] || 0) / n);
  if (pe >= 1 - 1e-12) return null;
  return (po - pe) / (1 - pe);
}
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
// Listing-level bootstrap. items: array of listing units; stat(sample) -> number|null.
function bootstrap(items, stat, { seed = 20250101, B = 10000 } = {}) {
  const rnd = mulberry32(seed);
  const vals = [];
  const n = items.length;
  for (let b = 0; b < B; b++) {
    const s = new Array(n);
    for (let i = 0; i < n; i++) s[i] = items[Math.floor(rnd() * n)];
    const v = stat(s);
    if (v !== null && v !== undefined && Number.isFinite(v)) vals.push(v);
  }
  vals.sort((x, y) => x - y);
  return { lo: quantile(vals, 0.025), hi: quantile(vals, 0.975), B: vals.length };
}
module.exports = { wilson, kappa, quantile, bootstrap, Z };