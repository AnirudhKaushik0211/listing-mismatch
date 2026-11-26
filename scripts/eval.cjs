'use strict';
// Metrics, gate, report. Usage: node scripts/eval.cjs --run <runId> [--check-repro] [--tune-tau]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sets = require('../src/sets.cjs');
const M = require('../src/metrics.cjs');
const gateMod = require('../src/gate.cjs');
const freeze = require('../src/freeze.cjs');
const report = require('../src/report.cjs');
const { canonical, sha256 } = require('../src/hash.cjs');
const { checkModelId } = require('../src/vlm/client.cjs');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const die = (m, c) => { console.error('[error] ' + m); process.exit(c); };
const runId = val('--run');
if (!runId) die('usage: node scripts/eval.cjs --run <runId> [--check-repro]', 1);
const dir = path.join(ROOT, 'eval', 'results-private', runId);
if (!fs.existsSync(path.join(dir, 'run.json'))) die('run not found: ' + runId, 1);
const run = JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'));
const mock = run.provider === 'mock';
// A dev subset run (listing-check --ids) is scored on its listed ids only.
const subset = (ls) => (run.ids ? ls.filter((l) => run.ids.includes(l.id)) : ls);
let capability;
if (run.sets.some((s) => sets.isHeldout(s))) {
  if (!freeze.countedRuns(freeze.readRuns(ROOT)).length) die('held-out sets need a counted run first', 2);
  capability = sets.makeRunnerCapability({ freezeVerified: true, by: 'eval' });
}
const readRecs = (set, checker) => {
  const p = path.join(dir, `${set}.${checker}.jsonl`);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : null;
};
function loadTasks() { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'labelling', 'tasks.js'), 'utf8'), ctx); return ctx.window.LISTING_TASKS; }
function compute() {
  const plantedName = run.sets.find((s) => s.includes('planted')), naturalName = run.sets.find((s) => s.includes('natural'));
  const checkers = (set) => { const o = {}; for (const c of run.checkers) { const r = readRecs(set, c); if (r) o[c] = new Map(r.map((x) => [x.id, x])); } return o; };
  const out = { runId, provider: run.provider, model: run.model || 'none', modelNote: run.model && !mock ? checkModelId(run.model).note : null, promptHash: run.promptHash || null, tau: run.tau, mock, planted: null, natural: { measured: false }, ops: null };
  const opsLists = [], costRecs = [];
  if (plantedName) {
    const listings = subset(sets.loadSet(plantedName, { capability }));
    const ck = checkers(plantedName);
    if (ck.vlm) { opsLists.push([...ck.vlm.values()]); costRecs.push(...ck.vlm.values()); }
    out.planted = M.plantedMetrics({ listings, checkers: ck, tau: run.tau });
    if (args.includes('--tune-tau') && ck.vlm) out.tauChoice = M.chooseTau(listings, ck.vlm);
  }
  if (naturalName) {
    const listings = subset(sets.loadSet(naturalName, { capability }));
    const ck = checkers(naturalName);
    if (ck.vlm) { opsLists.push([...ck.vlm.values()]); costRecs.push(...ck.vlm.values()); }
    let labels = null;
    try { labels = sets.loadLabels(naturalName, { capability, tasks: sets.isFixture(naturalName) ? null : loadTasks(), allowSynthetic: mock }); } catch (e) { die(e.message, e.exitCode || 2); }
    if (labels) {
      const state = labels.synthetic ? Object.fromEntries(labels.file.labels.map((l) => [l.id, l.attributes])) : labels.state;
      out.natural = M.naturalMetrics({ listings, labelState: state, checkers: ck, tau: run.tau });
    } else out.natural = { measured: false, reason: 'owner labels not available: not measured' };
  }
  out.ops = M.opsMetrics(opsLists);
  return { out, costRecs };
}
const { out: metrics, costRecs } = compute();
const text = JSON.stringify(JSON.parse(canonical(metrics)), null, 1) + '\n';
const mp = path.join(ROOT, 'eval', 'results', 'metrics.json');
if (args.includes('--check-repro')) {
  const again = JSON.stringify(JSON.parse(canonical(compute().out)), null, 1) + '\n';
  const disk = fs.existsSync(mp) ? fs.readFileSync(mp, 'utf8') : null;
  const same = disk !== null && sha256(disk) === sha256(again);
  console.log(`check-repro: metrics.json sha256 ${sha256(again)} ${same ? 'identical' : 'DIFFERENT'}`);
  process.exit(same ? 0 : 2);
}
const prices = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'eval', 'prices.json'), 'utf8')); } catch (e) { return null; } })();
const cost = M.costMetrics(costRecs, prices, run.provider, run.model);
const gate = gateMod.evaluate(metrics, { mock, repro: null, repo: null });
fs.mkdirSync(path.dirname(mp), { recursive: true });
fs.writeFileSync(mp, text);
fs.writeFileSync(path.join(ROOT, 'eval', 'cost.json'), JSON.stringify(cost, null, 1) + '\n');
// Examples for the Results page: text only, from the VLM verdict file of the planted set, plus natural.
const examples = [];
for (const set of run.sets) {
  const recs = readRecs(set, 'vlm');
  if (!recs || sets.isHeldout(set)) continue;
  const listings = new Map(sets.loadSet(set, { capability }).map((l) => [l.id, l]));
  for (const r of recs) {
    const l = listings.get(r.id);
    const flagged = Object.entries(r.attributes).filter(([, a]) => a.verdict === 'mismatch');
    if (flagged.length && examples.length < 12) { const [name, a] = flagged[0]; examples.push({ id: r.id, set, title: l.title, attributes: l.attributes, attribute: name, verdict: a.verdict, confidence: a.confidence, reason: a.reason }); }
  }
}
fs.writeFileSync(path.join(ROOT, 'docs', 'EVAL-REPORT.md'), report.renderReport(metrics, gate, cost));
fs.writeFileSync(path.join(ROOT, 'demo', 'results.js'), report.renderResultsJs(metrics, gate, cost, examples));
if (metrics.tauChoice) console.log('tau choice: ' + JSON.stringify({ tau: metrics.tauChoice.tau, reason: metrics.tauChoice.reason }));
console.log(`eval ${runId}: ${mock ? 'MOCK RUN, NOT A MEASUREMENT; ' : ''}gate ${gate.overall} (planted ${gate.planted}, natural ${gate.natural}); metrics.json sha256 ${sha256(text)}`);
process.exit(gate.exitCode);