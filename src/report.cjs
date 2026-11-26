'use strict';
// Renders docs/EVAL-REPORT.md and demo/results.js from metrics (no numbers are invented here).
const HONESTY = 'Built with AI coding agents; Anirudh wrote the spec, gates and reviews.';
const REVIEW = 'Design reviews were run by AI review agents; the owner decided which findings to accept.';
const NO_CLAIMS = 'There are no users, no production deployment and no adoption.';
const MOCK = 'MOCK RUN, NOT A MEASUREMENT';
const f = (x, d = 3) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const ci = (w) => (w && w.p !== null ? `${f(w.p)} (${f(w.lo)} to ${f(w.hi)}, n=${w.n})` : 'n/a');
function attrRows(by) {
  const rows = [];
  for (const [a, c] of Object.entries(by || {})) rows.push([a, c.tp, c.fp, c.fn, c.tn, f(c.precision), f(c.recall), f(c.f1), ci(c.cannotTell)]);
  return rows;
}
const table = (head, rows) => ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...rows.map((r) => '| ' + r.join(' | ') + ' |')].join('\n');
function statusLine(gate, mock) { return mock ? `Status: ${MOCK}. Gate: NOT EVALUABLE (mock provider).` : `Gate (verdict of record is counted run 1): ${gate.overall}. Planted criteria: ${gate.planted}. Natural criteria: ${gate.natural}.`; }
function renderReport(m, gate, cost, opts = {}) {
  const mock = !!m.mock;
  const L = [];
  L.push('# Evaluation report', '', HONESTY, '', REVIEW, '', NO_CLAIMS, '');
  if (mock) L.push(`**${MOCK}.** This report was produced by the mock provider on synthetic fixtures. It exercises the pipeline only. Nothing in it describes real model or listing behaviour.`, '');
  L.push(statusLine(gate, mock), '');
  L.push(`Run: ${m.runId}. Provider: ${m.provider}. Model: ${m.model}${m.modelNote ? ' (' + m.modelNote + ')' : ''}. Prompt hash: ${m.promptHash || 'n/a'}. tau: ${m.tau}.`, '');
  L.push('## Planted test (sets with known, programmatically derived ground truth)', '');
  if (m.planted) {
    L.push(`Listings: ${m.planted.listings}. Planted and natural results are never pooled.`, '');
    for (const [chk, by] of Object.entries(m.planted.byChecker)) L.push(`### ${chk}`, '', table(['attribute', 'TP', 'FP', 'FN', 'TN', 'precision', 'recall', 'F1', 'cannot_tell rate'], attrRows(by)), '');
    if (m.planted.g04) L.push(`Colour F1, far stratum: VLM ${f(m.planted.g04.vlmF1)}, colour baseline ${f(m.planted.g04.baselineF1)}; difference ${f(m.planted.g04.diff)} (bootstrap 95% ${f(m.planted.g04.lo)} to ${f(m.planted.g04.hi)}).`, '');
    L.push('Near-stratum colour swaps are excluded from the gate tables. Flagged counts: ' + JSON.stringify(m.planted.nearColour) + '.', '');
  } else L.push('Not run.', '');
  L.push('## Natural test (owner labels)', '');
  const n = m.natural;
  if (n && n.measured) {
    L.push(mock ? 'Labels here are synthetic fixture labels (not human labels).' : 'Labels are the owner\'s, given with no model output visible.', '');
    L.push(`Listings labelled: ${n.listings}. Natural mismatch rate: ${ci(n.rate)}. Cannot-tell sensitivity: lower-bound reading ${ci(n.rateLower)}; upper-bound reading ${ci(n.rateUpperReading)}.`, '');
    for (const [chk, c] of Object.entries(n.byChecker)) L.push(`### ${chk}`, '', `Kappa (three-class, colour, item type, material): ${f(c.kappa3)} (bootstrap ${f(c.kappa3CI.lo)} to ${f(c.kappa3CI.hi)}); binary kappa ${f(c.kappaBinary)}; flags ${c.flags}, confirmed ${c.confirmed}, hit rate ${f(c.hitRate)}; cannot_tell rate ${ci(c.cannotTellRate)}.`, '', table(['attribute', 'TP', 'FP', 'FN', 'TN', 'precision', 'recall', 'F1', 'cannot_tell rate'], attrRows(c.perAttribute)), '');
    if (typeof n.textDisagreements === 'number') L.push(`Listings where the text-only baseline finds a title-vs-attribute disagreement (not a photo mismatch): ${n.textDisagreements}.`, '');
  } else L.push('Not measured. Owner labels are not available, so no natural result is reported.', '');
  L.push('## Operations (pooled over both sets, labelled as pooled)', '', `Call-level failures: ${m.ops.failures} of ${m.ops.sent} listings sent (rate ${f(m.ops.failureRate)}). Attribute-level parse errors (not part of G07): ${m.ops.attributeParseErrors}.`, '');
  L.push('## Cost and latency', '', `Tokens: ${cost.inputTokens} input, ${cost.outputTokens} output. ${cost.costNote}. Cost per 1,000 listings: ${cost.costPer1000 === null ? 'not computed' : '$' + f(cost.costPer1000, 4)}. Latency ms: p50 ${f(cost.latencyMs.p50, 0)}, p95 ${f(cost.latencyMs.p95, 0)}, mean ${f(cost.latencyMs.mean, 1)}.${mock ? ' (Mock figures are fixed placeholders.)' : ''}`, '');
  L.push('## Gate criteria', '', mock ? '(Mock run: these rows only show that the gate code runs. They say nothing about any model.)' : '', '', table(['id', 'status', 'detail'], gate.criteria.map((c) => [c.id, c.status, c.detail])), '');
  L.push('## Limits', '', '- One marketplace catalog sample; its rate need not resemble any other marketplace.', '- One labeller, one pass; agreement is with one person.', '- Planted swaps are larger and cleaner than most real errors.', '- Small images make material and pattern hard to judge.', '- Model not pinned by the provider unless the identifier is a dated snapshot.', '');
  return L.join('\n');
}
function renderResultsJs(m, gate, cost, examples) {
  const mock = !!m.mock;
  const payload = {
    schema: 'listing-mismatch-results/v1', mock, stamp: mock ? MOCK : null,
    banner: mock ? `${MOCK}. Synthetic fixtures and the mock provider; no real result exists yet.` : statusLine(gate, false),
    run: { id: m.runId, provider: m.provider, model: m.model, tau: m.tau },
    plantedTable: m.planted ? attrRows(m.planted.byChecker.vlm) : [],
    baselineTable: m.planted ? ['baseline-colour', 'baseline-text'].filter((c) => m.planted.byChecker[c]).map((c) => ({ checker: c, rows: attrRows(m.planted.byChecker[c]) })) : [],
    naturalMeasured: !!(m.natural && m.natural.measured),
    naturalSummary: m.natural && m.natural.measured ? { listings: m.natural.listings, rate: ci(m.natural.rate), sensitivity: ci(m.natural.rateUpperReading), vlm: m.natural.byChecker.vlm ? { kappa: f(m.natural.byChecker.vlm.kappa3), hitRate: f(m.natural.byChecker.vlm.hitRate) } : null } : null,
    patterns: m.natural && m.natural.measured ? m.natural.tags : null,
    ops: m.ops, cost: { tokens: [cost.inputTokens, cost.outputTokens], costNote: cost.costNote, costPer1000: cost.costPer1000, latencyMs: cost.latencyMs },
    examples: examples.slice(0, 12),
    limits: ['One marketplace catalog sample.', 'One labeller.', 'Planted swaps are easier than real errors.', REVIEW],
    citation: 'Collins et al., "ABO: Dataset and Benchmarks for Real-World 3D Object Understanding", CVPR 2022 (public dataset, used for non-commercial portfolio research).',
    honesty: [HONESTY, NO_CLAIMS]
  };
  return '/* GENERATED by scripts/eval.cjs. Do not edit. */\nwindow.LISTING_RESULTS = ' + JSON.stringify(payload) + ';\n';
}
module.exports = { renderReport, renderResultsJs, HONESTY, REVIEW, NO_CLAIMS, MOCK };