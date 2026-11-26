'use strict';
// Gate thresholds and evaluation. One source of truth; a test compares TABLE with the table in docs/SPEC.md (between GATE:BEGIN and GATE:END).
const TABLE = [
  ['G01', 'planted-heldout', 'Colour, far stratum: mismatch precision and recall', 'precision >= 0.85 and recall >= 0.70', 'FAIL'],
  ['G02', 'planted-heldout', 'Item type: mismatch precision and recall', 'precision >= 0.85 and recall >= 0.70', 'FAIL'],
  ['G03', 'planted-heldout', 'cannot_tell rate over all colour pairs (near-stratum swapped colour pairs excluded) and all item-type pairs', '<= 0.25', 'FAIL'],
  ['G04', 'planted-heldout', 'Colour F1, far stratum, same pairs as G01: VLM minus colour baseline', 'difference >= 0.10 and bootstrap 95% lower bound > 0', 'FAIL'],
  ['G05', 'natural-heldout', "Three-class Cohen's kappa vs owner labels over colour, item-type and material pairs", 'kappa >= 0.61', 'INCONCLUSIVE if fewer than 15 owner `mismatch` pairs among those attributes'],
  ['G06', 'natural-heldout', 'Review-queue hit rate over colour, item-type and material pairs', '>= 0.50', 'INCONCLUSIVE if fewer than 10 VLM effective mismatches among those pairs'],
  ['G07', 'planted-heldout + natural-heldout', 'Call-level failures (parse failure after the retry, or provider error after retries) as a share of listings sent', '<= 0.02', 'FAIL'],
  ['G08', 'all', 'Reproducibility: `eval.cjs --check-repro` reproduces the SHA-256 of `metrics.json`', 'identical', 'FAIL'],
  ['G09', 'repository', '`npm test` passes; `denylist.cjs` finds no secret, banned term, banned phrase or missing honesty sentence; `.denylist.local` is present with at least 3 terms', 'pass', 'FAIL']
];
const T = { precision: 0.85, recall: 0.70, cannotTell: 0.25, f1Margin: 0.10, kappa: 0.61, hitRate: 0.50, failures: 0.02, minOwnerMismatch: 15, minFlags: 10 };
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const st = (id, status, detail) => ({ id, status, detail });
function prRule(id, c) {
  if (!c || !num(c.precision) || !num(c.recall)) return st(id, 'FAIL', 'precision or recall not defined (n/a)');
  const ok = c.precision >= T.precision && c.recall >= T.recall;
  return st(id, ok ? 'PASS' : 'FAIL', `precision ${c.precision.toFixed(3)}, recall ${c.recall.toFixed(3)}`);
}
// m: metrics object; ctx: { mock, unfrozen, repro (bool|null), repo (bool|null) }
function evaluate(m, ctx = {}) {
  const c = [];
  const p = m.planted || {}, n = m.natural || {}, o = m.ops || {};
  c.push(prRule('G01', p.colourFar));
  c.push(prRule('G02', p.itemType));
  c.push(p.g03 && num(p.g03.rate) ? st('G03', p.g03.rate <= T.cannotTell ? 'PASS' : 'FAIL', `cannot_tell rate ${p.g03.rate.toFixed(3)}`) : st('G03', 'FAIL', 'not evaluable'));
  c.push(p.g04 && num(p.g04.diff) && num(p.g04.lo) ? st('G04', p.g04.diff >= T.f1Margin && p.g04.lo > 0 ? 'PASS' : 'FAIL', `F1 difference ${p.g04.diff.toFixed(3)}, lower bound ${p.g04.lo.toFixed(3)}`) : st('G04', 'FAIL', 'not evaluable'));
  if (!n.g05 || n.g05.ownerMismatch < T.minOwnerMismatch) c.push(st('G05', 'INCONCLUSIVE', `owner mismatch pairs ${n.g05 ? n.g05.ownerMismatch : 0} < ${T.minOwnerMismatch}`));
  else c.push(num(n.g05.kappa) ? st('G05', n.g05.kappa >= T.kappa ? 'PASS' : 'FAIL', `kappa ${n.g05.kappa.toFixed(3)}`) : st('G05', 'FAIL', 'kappa n/a'));
  if (!n.g06 || n.g06.flags < T.minFlags) c.push(st('G06', 'INCONCLUSIVE', `VLM flags ${n.g06 ? n.g06.flags : 0} < ${T.minFlags}`));
  else c.push(st('G06', n.g06.rate >= T.hitRate ? 'PASS' : 'FAIL', `hit rate ${n.g06.rate.toFixed(3)}`));
  c.push(num(o.failureRate) ? st('G07', o.failureRate <= T.failures ? 'PASS' : 'FAIL', `failure rate ${o.failureRate.toFixed(3)}`) : st('G07', 'FAIL', 'not evaluable'));
  c.push(ctx.repro === true ? st('G08', 'PASS', 'identical') : ctx.repro === false ? st('G08', 'FAIL', 'metrics.json hash differs') : st('G08', 'FAIL', 'not checked'));
  c.push(ctx.repo === true ? st('G09', 'PASS', 'pass') : ctx.repo === false ? st('G09', 'FAIL', 'repository checks failed') : st('G09', 'FAIL', 'not checked'));
  const by = (ids) => ids.map((i) => c.find((x) => x.id === i).status);
  const sub = (ids) => { const s = by(ids); return s.includes('FAIL') ? 'FAIL' : s.includes('INCONCLUSIVE') ? 'INCONCLUSIVE' : 'PASS'; };
  let overall;
  if (ctx.mock || ctx.unfrozen) overall = 'NOT EVALUABLE';
  else overall = c.some((x) => x.status === 'FAIL') ? 'GATE FAIL' : c.some((x) => x.status === 'INCONCLUSIVE') ? 'GATE INCONCLUSIVE' : 'GATE PASS';
  const exit = { 'GATE PASS': 0, 'GATE FAIL': 10, 'GATE INCONCLUSIVE': 11, 'NOT EVALUABLE': 12 }[overall];
  return { criteria: c, overall, planted: sub(['G01', 'G02', 'G03', 'G04']), natural: sub(['G05', 'G06']), exitCode: exit };
}
module.exports = { TABLE, T, evaluate };