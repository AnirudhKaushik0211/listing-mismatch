'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fz = require('../src/freeze.cjs');
const { ROOT } = require('./helpers.cjs');
const run = (cwd, ...a) => fz.git(cwd, a);
function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lmf-'));
  for (const p of ['src', 'scripts', 'package.json']) fs.cpSync(path.join(ROOT, p), path.join(d, p), { recursive: true });
  fs.mkdirSync(path.join(d, 'docs')); fs.mkdirSync(path.join(d, 'eval')); fs.mkdirSync(path.join(d, 'labelling')); fs.mkdirSync(path.join(d, 'data/labels'), { recursive: true });
  fs.writeFileSync(path.join(d, 'docs/SPEC.md'), 'intro\n<!-- FROZEN:BEGIN -->\nfrozen text\n<!-- FROZEN:END -->\nafter\n');
  fs.writeFileSync(path.join(d, 'docs/DATA-PLAN.md'), 'plan\n');
  fs.writeFileSync(path.join(d, 'labelling/labelling.js'), '// x\n');
  fs.writeFileSync(path.join(d, 'labelling/tasks.js'), '// tasks\n');
  fs.writeFileSync(path.join(d, 'eval/HISTORY.md'), '# history\n');
  fs.writeFileSync(path.join(d, '.gitignore'), 'data/\neval/runs.jsonl\n');
  run(d, 'init'); run(d, 'add', '-A'); run(d, 'commit', '-m', 'initial');
  return d;
}
const approve = (d, item) => { const p = path.join(d, 'eval/approvals.json'); const l = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : []; l.push({ item, text: 'statement long enough', date: '2000-01-01' }); fs.writeFileSync(p, JSON.stringify(l)); };
const commitAll = (d, m) => { run(d, 'add', '-A'); run(d, 'commit', '-m', m); };
const record = (d, r) => { fs.appendFileSync(path.join(d, 'eval/HISTORY.md'), `\n${r.commit}\n`); commitAll(d, 'history'); };
test('freeze-git: refusals and a valid four-stage sequence', () => {
  const d = repo();
  assert.throws(() => fz.freezeStage('gate', d), /gate approval missing/);
  approve(d, 'gate');
  assert.throws(() => fz.freezeStage('gate', d), /not clean/); // approvals.json is untracked
  commitAll(d, 'approval');
  const g = fz.freezeStage('gate', d);
  assert.ok(/^freeze stage gate: /.test(run(d, 'log', '-1', '--format=%s'))); assert.ok(g.message.includes('specFrozenRegion='));
  assert.throws(() => fz.freezeStage('data', d), /HISTORY/); // previous commit id not yet recorded
  assert.throws(() => fz.freezeStage('method', d, { model: 'gemini-2.5-flash', tau: 0.7 }), /previous stage commit not found/);
  record(d, g);
  fs.writeFileSync(path.join(d, 'dirty.txt'), 'x');
  assert.throws(() => fz.freezeStage('data', d), /not clean/); fs.rmSync(path.join(d, 'dirty.txt'));
  run(d, 'checkout', '-q', '-b', 'side', 'HEAD~2'); // an earlier commit: the gate commit exists but is not an ancestor
  assert.throws(() => fz.freezeStage('data', d), /not an ancestor|HISTORY/);
  run(d, 'checkout', '-q', '-'); 
  const dat = fz.freezeStage('data', d); record(d, dat);
  approve(d, 'data-use'); commitAll(d, 'data-use');
  assert.throws(() => fz.freezeStage('method', d, { model: 'gemini-flash-latest', tau: 0.7 }), /refused/);
  const meth = fz.freezeStage('method', d, { model: 'gemini-2.5-flash', tau: 0.7 }); record(d, meth);
  assert.throws(() => fz.freezeStage('method', d, { model: 'gemini-2.5-flash', tau: 0.7 }), /already written|previous|HISTORY/);
  // labels: needs labels-own, an owner file created after stage 2
  fs.writeFileSync(path.join(d, 'data/labels/natural-heldout.labels.json'), JSON.stringify({ synthetic: false, labeller: 'owner', createdAt: '2000-01-01T00:00:00.000Z', labels: [] }));
  assert.throws(() => fz.freezeStage('labels', d), /labels-own/);
  approve(d, 'labels-own'); commitAll(d, 'labels-own');
  assert.throws(() => fz.freezeStage('labels', d), /earlier than the stage 2/);
  fs.writeFileSync(path.join(d, 'data/labels/natural-heldout.labels.json'), JSON.stringify({ synthetic: false, labeller: 'owner', createdAt: '2999-01-01T00:00:00.000Z', labels: [] }));
  const lab = fz.freezeStage('labels', d);
  const subjects = run(d, 'log', '--format=%s').split('\n').filter((s) => s.startsWith('freeze stage'));
  assert.strictEqual(subjects.length, 4); ['gate', 'data', 'method', 'labels'].forEach((s) => assert.ok(subjects.some((x) => x.startsWith('freeze stage ' + s + ': '))));
  record(d, lab);
  // held-out run guard
  const base = { root: d, provider: 'gemini', model: 'gemini-2.5-flash', reason: 'first counted run for the record', runNumber: 1 };
  assert.throws(() => fz.checkHeldoutRun(base), /no smoke record/);
  fs.writeFileSync(path.join(d, 'eval/runs.jsonl'), JSON.stringify({ status: 'smoke', provider: 'gemini', model: 'gemini-2.5-flash' }) + '\n');
  assert.ok(fz.checkHeldoutRun(base).freezeVerified);
  assert.throws(() => fz.checkHeldoutRun({ ...base, provider: 'mock' }), /mock/);
  assert.throws(() => fz.checkHeldoutRun({ ...base, reason: 'short' }), /reason/);
  assert.throws(() => fz.checkHeldoutRun({ ...base, model: 'gemini-2.0-flash' }), /model differs/);
  assert.throws(() => fz.checkHeldoutRun({ ...base, runNumber: 2 }), /must be 1/);
  // a void run does not count; an aborted run after a 2xx does
  fs.appendFileSync(path.join(d, 'eval/runs.jsonl'), JSON.stringify({ run: 1, status: 'started' }) + '\n' + JSON.stringify({ run: 1, status: 'void' }) + '\n');
  assert.deepStrictEqual(fz.countedRuns(fz.readRuns(d)), []);
  assert.ok(fz.checkHeldoutRun(base));
  fs.appendFileSync(path.join(d, 'eval/runs.jsonl'), JSON.stringify({ run: 1, status: 'started' }) + '\n' + JSON.stringify({ run: 1, status: 'aborted' }) + '\n');
  assert.deepStrictEqual(fz.countedRuns(fz.readRuns(d)), [1]);
  assert.throws(() => fz.checkHeldoutRun({ ...base, runNumber: 2 }), /HISTORY/); // runs.jsonl and HISTORY disagree
  fs.appendFileSync(path.join(d, 'eval/HISTORY.md'), '\n## 2000-01-02 - held-out run 1: first\n');
  assert.ok(fz.checkHeldoutRun({ ...base, runNumber: 2 }));
  // a changed frozen hash is a guard violation
  fs.appendFileSync(path.join(d, 'src/prompts/check-v1.txt'), '\nextra');
  assert.throws(() => fz.checkHeldoutRun({ ...base, runNumber: 2 }), /frozen hash changed/);
});
test('freeze: SPEC frozen region extraction normalises CRLF', () => {
  assert.strictEqual(fz.frozenRegion('a\r\n<!-- FROZEN:BEGIN -->\r\nx\r\n<!-- FROZEN:END -->\r\nb'), 'x');
  assert.throws(() => fz.frozenRegion('no markers'));
});
test('freeze: marker names quoted in prose do not end the region, and an empty region is refused', () => {
  const spec = 'x\n<!-- FROZEN:BEGIN -->\nabout `FROZEN:BEGIN` and `FROZEN:END` markers\nbody\n<!-- FROZEN:END -->\ny';
  assert.strictEqual(fz.frozenRegion(spec), 'about `FROZEN:BEGIN` and `FROZEN:END` markers\nbody');
  assert.throws(() => fz.frozenRegion('<!-- FROZEN:BEGIN -->\n\n<!-- FROZEN:END -->'), /empty/);
  const real = fz.frozenRegion(fs.readFileSync(path.join(ROOT, 'docs/SPEC.md'), 'utf8'));
  assert.ok(real.length > 10000 && real.includes('Pre-registration'));
});