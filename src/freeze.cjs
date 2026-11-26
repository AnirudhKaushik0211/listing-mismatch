'use strict';
// Freeze hashes, local-git stage commits, approvals and held-out run guards (SPEC 10). Owner-run via scripts/freeze.cjs.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { fileHash, textHash, sha256 } = require('./hash.cjs');
const { checkModelId } = require('./vlm/client.cjs');
const ROOT = path.join(__dirname, '..');
const STAGES = ['gate', 'data', 'method', 'labels'];
class GuardError extends Error { constructor(m) { super(m); this.exitCode = 2; } }
const exists = (root, rel) => fs.existsSync(path.join(root, rel));
const readJson = (root, rel, dflt) => { try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); } catch (e) { return dflt; } };
function frozenRegion(specText) {
  const s = String(specText).replace(/\r\n/g, '\n').split('\n');
  const a = s.findIndex((l) => /^\s*<!--\s*FROZEN:BEGIN\s*-->\s*$/.test(l)), b = s.findIndex((l) => /^\s*<!--\s*FROZEN:END\s*-->\s*$/.test(l));
  if (a < 0 || b < 0 || b <= a) throw new GuardError('FROZEN markers not found in SPEC');
  const region = s.slice(a + 1, b).join('\n');
  if (region.trim() === '') throw new GuardError('frozen region of SPEC is empty');
  return region;
}
function codeFiles(root) {
  const out = [];
  const walk = (dir, filt) => { const d = path.join(root, dir); if (!fs.existsSync(d)) return; for (const n of fs.readdirSync(d, { withFileTypes: true })) { const rel = dir + '/' + n.name; if (n.isDirectory()) walk(rel, filt); else if (filt(rel)) out.push(rel); } };
  walk('src', (r) => /\.(cjs|js)$/.test(r) && r !== 'src/report.cjs');
  walk('scripts', (r) => /\.cjs$/.test(r));
  for (const r of ['labelling/labelling.js', 'package.json', 'package-lock.json']) if (exists(root, r)) out.push(r);
  return out.sort();
}
function codeHash(root) { return sha256(codeFiles(root).map((r) => fileHash(path.join(root, r))).join('\n')); }
function stageHashes(stage, root, opts = {}) {
  const h = (rel) => (exists(root, rel) ? fileHash(path.join(root, rel)) : 'absent');
  if (stage === 'gate') return { specFrozenRegion: textHash(frozenRegion(fs.readFileSync(path.join(root, 'docs/SPEC.md'), 'utf8'))), dataPlan: h('docs/DATA-PLAN.md'), gateCode: h('src/gate.cjs') };
  if (stage === 'data') {
    const files = ['src/lexicon.json', 'src/families.json', 'data/splits/natural-dev.json', 'data/splits/planted-dev.json', 'data/heldout/natural-heldout.json', 'data/heldout/planted-heldout.json', 'data/splits/planting-log-dev.jsonl', 'data/heldout/planting-log-heldout.jsonl', 'data/splits/image-hashes-natural-dev.txt', 'data/splits/image-hashes-planted-dev.txt', 'data/heldout/image-hashes-natural-heldout.txt', 'data/heldout/image-hashes-planted-heldout.txt', exists(root, 'data/SOURCES.lock.json') ? 'data/SOURCES.lock.json' : 'DATA-SOURCES.md'];
    return Object.fromEntries(files.map((f) => [f, h(f)]));
  }
  if (stage === 'method') {
    if (!opts.model || !opts.tau) throw new GuardError('stage method needs --model and --tau');
    const m = checkModelId(opts.model);
    if (!m.ok) throw new GuardError('model identifier refused: ' + m.note);
    const { promptHash } = require('./core/prompt.js');
    return { prompt: h('src/prompts/check-v1.txt'), promptHash: promptHash(), families: h('src/families.json'), baselineTuning: h('eval/baseline-tuning.json'), tau: Number(opts.tau), model: opts.model, modelNote: m.note, codeHash: codeHash(root) };
  }
  if (stage === 'labels') return { labels: h('data/labels/natural-heldout.labels.json'), tasks: h('labelling/tasks.js') };
  throw new GuardError('unknown stage');
}
function git(root, args) { return execFileSync('git', ['-c', 'user.name=listing-mismatch freeze', '-c', 'user.email=freeze@localhost', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false }).trim(); }
function loadApprovals(root) { return readJson(root, 'eval/approvals.json', []); }
const hasApproval = (root, item) => loadApprovals(root).some((a) => a.item === item && a.text && a.date);
function readRuns(root) {
  const p = path.join(root, 'eval/runs.jsonl');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
}
// Counted = a run with a final status completed or aborted (a void run, or one still only started, is not counted).
function countedRuns(runs) {
  const by = {};
  for (const r of runs) if (r.run) (by[r.run] = by[r.run] || []).push(r);
  return Object.entries(by).filter(([, l]) => l.some((x) => x.status === 'completed' || x.status === 'aborted')).map(([k]) => Number(k));
}
function historyRunCount(root) {
  const p = path.join(root, 'eval/HISTORY.md');
  return fs.existsSync(p) ? (fs.readFileSync(p, 'utf8').match(/^## .*held-out run \d+/gim) || []).length : 0;
}
// Runs one freeze stage. Owner-run only.
function freezeStage(stage, root, opts = {}) {
  const idx = STAGES.indexOf(stage);
  if (idx < 0) throw new GuardError('unknown stage');
  if (git(root, ['status', '--porcelain']) !== '') throw new GuardError('working tree is not clean');
  const hist = path.join(root, 'eval/HISTORY.md');
  if (idx > 0) {
    const prev = STAGES[idx - 1];
    const log = git(root, ['log', '--all', '--format=%H%x09%s']).split('\n').map((l) => l.split('\t'));
    const hit = log.find(([, s]) => s && s.startsWith('freeze stage ' + prev + ':'));
    if (!hit) throw new GuardError('previous stage commit not found: ' + prev);
    try { git(root, ['merge-base', '--is-ancestor', hit[0], 'HEAD']); } catch (e) { throw new GuardError('previous stage commit is not an ancestor of HEAD'); }
    const committed = (() => { try { return git(root, ['show', 'HEAD:eval/HISTORY.md']); } catch (e) { return ''; } })();
    if (!committed.includes(hit[0]) && !committed.includes(hit[0].slice(0, 7))) throw new GuardError('committed eval/HISTORY.md lacks the previous stage commit id');
  }
  if (stage === 'gate' && !hasApproval(root, 'gate') && !opts.skipApproval) throw new GuardError('owner gate approval missing in eval/approvals.json');
  if (stage === 'method' && !opts.skipApproval && !hasApproval(root, 'data-use')) throw new GuardError('data-use approval missing');
  if (stage === 'labels') {
    if (!hasApproval(root, 'labels-own')) throw new GuardError('labels-own approval missing');
    const lp = path.join(root, 'data/labels/natural-heldout.labels.json');
    if (!fs.existsSync(lp)) throw new GuardError('natural-heldout labels file missing');
    const lab = JSON.parse(fs.readFileSync(lp, 'utf8'));
    const fz = readJson(root, 'eval/freeze.json', { stages: {} });
    const m = fz.stages.method;
    if (m && lab.createdAt < m.createdAt) throw new GuardError('labels createdAt is earlier than the stage 2 timestamp');
    if (lab.synthetic !== false || lab.labeller !== 'owner') throw new GuardError('labels must be owner labels with synthetic false');
  }
  const fz = readJson(root, 'eval/freeze.json', { stages: {} });
  if (fz.stages[stage] && !opts.amend) throw new GuardError('stage already written; a stage cannot be rewritten');
  const hashes = stageHashes(stage, root, opts);
  const entry = { createdAt: new Date().toISOString(), ...hashes };
  fz.stages[stage] = entry;
  fs.mkdirSync(path.join(root, 'eval'), { recursive: true });
  fs.writeFileSync(path.join(root, 'eval/freeze.json'), JSON.stringify(fz, null, 1) + '\n');
  const msg = 'freeze stage ' + stage + ': ' + Object.entries(hashes).map(([k, v]) => `${k}=${v}`).join(' ');
  git(root, ['add', 'eval/freeze.json']);
  git(root, ['commit', '-m', msg]);
  const commit = git(root, ['rev-parse', 'HEAD']);
  void hist;
  return { stage, commit, entry, message: msg };
}
// Held-out run guard (SPEC 10.2). Returns {ok:true, capability inputs} or throws GuardError naming the failed check.
function checkHeldoutRun(o) {
  const root = o.root || ROOT;
  const fail = (m) => { throw new GuardError('held-out run refused: ' + m); };
  const fz = readJson(root, 'eval/freeze.json', null);
  if (!fz || !fz.stages) fail('eval/freeze.json missing');
  for (const s of STAGES) if (!fz.stages[s]) fail('freeze stage missing: ' + s);
  for (const s of ['gate', 'data', 'labels']) {
    const now = stageHashes(s, root);
    for (const [k, v] of Object.entries(now)) if (fz.stages[s][k] !== v) fail(`frozen hash changed (${s}.${k})`);
  }
  const m = fz.stages.method;
  const now = stageHashes('method', root, { model: m.model, tau: m.tau });
  for (const k of ['prompt', 'promptHash', 'families', 'baselineTuning', 'codeHash']) if (m[k] !== now[k]) fail(`frozen hash changed (method.${k})`);
  if (!hasApproval(root, 'gate')) fail('gate approval missing');
  if (!hasApproval(root, 'data-use')) fail('data-use approval missing');
  if (o.provider === 'mock') fail('mock provider cannot run held-out sets');
  if (!o.reason || o.reason.length < 10 || o.reason.length > 300) fail('--reason missing or not 10 to 300 characters');
  if (o.model !== m.model) fail('model differs from stage 2');
  if (!checkModelId(o.model).ok) fail('model identifier refused');
  const runs = readRuns(root);
  const counted = countedRuns(runs);
  if (!o.continueRun) {
    if (counted.length >= 3) fail('run budget exhausted (3 counted runs)');
    if (Number(o.runNumber) !== counted.length + 1) fail('--heldout-run must be ' + (counted.length + 1));
  }
  if (!runs.some((r) => r.status === 'smoke' && r.provider === o.provider && r.model === o.model)) fail('no smoke record for this provider and model');
  if (historyRunCount(root) !== counted.length) fail('eval/runs.jsonl counted runs differ from HISTORY.md run entries');
  return { ok: true, freezeVerified: true };
}
module.exports = { STAGES, GuardError, frozenRegion, stageHashes, codeHash, codeFiles, freezeStage, checkHeldoutRun, loadApprovals, hasApproval, readRuns, countedRuns, historyRunCount, git };