'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { wilson, kappa, bootstrap, quantile } = require('../src/stats.cjs');
const near = (a, b, e = 1e-4) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
test('wilson known values', () => {
  const w = wilson(70, 100); near(w.lo, 0.6038, 1e-3); near(w.hi, 0.7811, 1e-3); // textbook 0.604 to 0.781
  const z = wilson(0, 10); near(z.lo, 0); near(z.hi, 0.2775);
  assert.strictEqual(wilson(0, 0).p, null);
});
test('kappa on a hand-computed table', () => {
  // 20 agree-yes, 5 yes/no, 10 no/yes, 15 agree-no: po 0.7, pe 0.5*0.6... computed below
  const a = [], b = [];
  const add = (x, y, n) => { for (let i = 0; i < n; i++) { a.push(x); b.push(y); } };
  add('y', 'y', 20); add('y', 'n', 5); add('n', 'y', 10); add('n', 'n', 15);
  // po = 35/50 = .7 ; pa(y)=.5 pb(y)=.6 ; pe = .5*.6+.5*.4 = .5 ; kappa = .4
  near(kappa(a, b), 0.4);
  assert.strictEqual(kappa(['a', 'a'], ['a', 'a']), null); // pe = 1
});
test('quantile and seeded bootstrap are deterministic', () => {
  assert.strictEqual(quantile([1, 2, 3, 4, 5], 0.5), 3);
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const stat = (s) => s.reduce((x, y) => x + y, 0) / s.length;
  const r1 = bootstrap(items, stat, { seed: 20250101, B: 500 }), r2 = bootstrap(items, stat, { seed: 20250101, B: 500 });
  assert.deepStrictEqual(r1, r2);
  assert.ok(r1.lo < 5.5 && r1.hi > 5.5);
});