'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, workdir } = require('./helpers.cjs');
const node = (cwd, ...a) => spawnSync(process.execPath, a, { cwd, encoding: 'utf8', env: { ...process.env, LISTING_VLM_PROVIDER: '', GEMINI_API_KEY: '' } });
test('integration: mock check -> eval -> check-repro -> report says MOCK RUN, NOT A MEASUREMENT (exit 12)', () => {
  const d = workdir();
  const R = (a) => node(d, ...a);
  for (const a of [
    ['scripts/listing-check.cjs', '--checker', 'vlm', '--provider', 'mock', '--sets', 'fixture-planted,fixture-natural', '--run-id', 'it', '--tau', '0.6'],
    ['scripts/listing-check.cjs', '--checker', 'baseline-colour', '--sets', 'fixture-planted,fixture-natural', '--run-id', 'it'],
    ['scripts/listing-check.cjs', '--checker', 'baseline-text', '--sets', 'fixture-planted,fixture-natural', '--run-id', 'it']
  ]) { const r = R(a); assert.strictEqual(r.status, 0, r.stderr); }
  const e = R(['scripts/eval.cjs', '--run', 'it']);
  assert.strictEqual(e.status, 12, e.stdout + e.stderr); assert.ok(e.stdout.includes('MOCK RUN, NOT A MEASUREMENT'));
  const m1 = fs.readFileSync(path.join(d, 'eval/results/metrics.json'), 'utf8');
  const rep = R(['scripts/eval.cjs', '--run', 'it', '--check-repro']);
  assert.strictEqual(rep.status, 0, rep.stdout + rep.stderr); assert.ok(rep.stdout.includes('identical'));
  assert.strictEqual(fs.readFileSync(path.join(d, 'eval/results/metrics.json'), 'utf8'), m1);
  const md = fs.readFileSync(path.join(d, 'docs/EVAL-REPORT.md'), 'utf8');
  assert.ok(md.includes('MOCK RUN, NOT A MEASUREMENT') && md.includes('NOT EVALUABLE') && md.includes('Built with AI coding agents; Anirudh wrote the spec, gates and reviews.') && md.includes('Design reviews were run by AI review agents; the owner decided which findings to accept.'));
  const m = JSON.parse(m1);
  assert.strictEqual(m.mock, true); assert.strictEqual(m.planted.listings, 10); assert.strictEqual(m.ops.sent, 16); assert.strictEqual(m.ops.failures, 0);
  assert.ok(m.planted.byChecker.vlm.colour && m.planted.byChecker['baseline-colour'].colour && m.planted.byChecker['baseline-text'].item_type);
  assert.strictEqual(m.natural.measured, true); assert.strictEqual(m.natural.listings, 6);
  assert.ok(!JSON.stringify(m).includes('costUsd')); // cost lives in cost.json, not the hashed metrics
  assert.ok(fs.existsSync(path.join(d, 'eval/cost.json')));
  const js = fs.readFileSync(path.join(d, 'demo/results.js'), 'utf8');
  const ctx = { window: {} }; require('vm').runInNewContext(js, ctx);
  assert.strictEqual(ctx.window.LISTING_RESULTS.mock, true); assert.strictEqual(ctx.window.LISTING_RESULTS.stamp, 'MOCK RUN, NOT A MEASUREMENT');
  assert.ok(ctx.window.LISTING_RESULTS.examples.length <= 12);
  // determinism across a fresh run
  const d2 = workdir();
  for (const a of [['--checker', 'vlm', '--provider', 'mock'], ['--checker', 'baseline-colour'], ['--checker', 'baseline-text']]) node(d2, 'scripts/listing-check.cjs', ...a, '--sets', 'fixture-planted,fixture-natural', '--run-id', 'it', '--tau', '0.6');
  node(d2, 'scripts/eval.cjs', '--run', 'it');
  assert.strictEqual(fs.readFileSync(path.join(d2, 'eval/results/metrics.json'), 'utf8'), m1);
});
test('integration: held-out sets are refused by the runner, mock and eval (exit 2); real provider needs --yes and a model', () => {
  const d = workdir();
  for (const s of ['planted-heldout', 'natural-heldout']) {
    const r = node(d, 'scripts/listing-check.cjs', '--checker', 'vlm', '--provider', 'mock', '--sets', s, '--heldout-run', '1', '--reason', 'a long enough reason');
    assert.strictEqual(r.status, 2, r.stderr); assert.ok(/held-out run refused/.test(r.stderr));
  }
  const noModel = node(d, 'scripts/listing-check.cjs', '--checker', 'vlm', '--provider', 'gemini', '--sets', 'fixture-planted');
  assert.strictEqual(noModel.status, 1); assert.ok(/missing model/.test(noModel.stderr));
  const noKeyNoYes = node(d, 'scripts/listing-check.cjs', '--checker', 'vlm', '--provider', 'gemini', '--model', 'gemini-2.5-flash', '--sets', 'fixture-planted');
  assert.strictEqual(noKeyNoYes.status, 0); assert.ok(/No call made/.test(noKeyNoYes.stdout)); assert.ok(!fs.existsSync(path.join(d, 'eval/runs.jsonl')));
  assert.strictEqual(node(d, 'scripts/listing-check.cjs', '--bogus').status, 1);
  fs.mkdirSync(path.join(d, 'eval/results-private/h'), { recursive: true });
  fs.writeFileSync(path.join(d, 'eval/results-private/h/run.json'), JSON.stringify({ runId: 'h', sets: ['planted-heldout'], checkers: ['vlm'], provider: 'gemini', model: 'm', tau: 0.7 }));
  assert.strictEqual(node(d, 'scripts/eval.cjs', '--run', 'h').status, 2);
});
test('integration: --ids runs a dev subset, is scored on those ids only, and refuses held-out sets', () => {
  const d = workdir();
  const ids = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/fixture-planted.json'), 'utf8')).slice(0, 3).map((l) => l.id);
  const r = node(d, 'scripts/listing-check.cjs', '--checker', 'vlm', '--provider', 'mock', '--sets', 'fixture-planted', '--run-id', 'sub', '--ids', ids.join(','));
  assert.strictEqual(r.status, 0, r.stderr); assert.ok(/3 listings written/.test(r.stdout), r.stdout);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(d, 'eval/results-private/sub/run.json'), 'utf8')).ids, [...ids].sort());
  node(d, 'scripts/eval.cjs', '--run', 'sub');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(d, 'eval/results/metrics.json'), 'utf8')).planted.listings, 3);
  const h = node(d, 'scripts/listing-check.cjs', '--checker', 'vlm', '--provider', 'mock', '--sets', 'planted-heldout', '--ids', ids[0]);
  assert.strictEqual(h.status, 2); assert.ok(/dev-only/.test(h.stderr));
});
test('fixtures: label-pattern files only where allowed; fixtures are synthetic with no real ids', () => {
  const hits = [];
  const walk = (rel) => { for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) { if (['node_modules', 'data', '.git', '.agents'].includes(e.name)) continue; walk(r); } else if (/^labels-.*\.json$|\.labels\.json$|\.fixture-labels\.json$/.test(e.name)) hits.push(r); } };
  walk('');
  assert.deepStrictEqual(hits.filter((h) => !h.startsWith('test/fixtures/')), []);
  assert.ok(hits.every((h) => h.endsWith('.fixture-labels.json')));
  const real = new Set(); for (const f of ['data/splits/natural-dev.json', 'data/splits/planted-dev.json']) if (fs.existsSync(path.join(ROOT, f))) JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')).forEach((r) => real.add(r.id));
  for (const h of hits) {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, h), 'utf8')); assert.strictEqual(j.synthetic, true);
    for (const l of j.labels) { assert.ok(l.id.startsWith('FX-')); assert.ok(!real.has(l.id)); }
  }
  for (const f of ['fixture-planted.json', 'fixture-natural.json']) for (const r of JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures', f), 'utf8'))) { assert.ok(r.id.startsWith('FX-')); assert.ok(!real.has(r.id)); }
});
test('fixtures: build-sample and plant print no held-out id or title (counts only)', () => {
  const d = workdir();
  const cats = ['CHAIR', 'TABLE', 'SOFA', 'SHOES'], pool = [];
  for (let i = 0; i < 400; i++) { const c = cats[i % 4]; pool.push({ item_id: 'ZQ' + String(i).padStart(4, '0'), product_type: c, title: `Zeta Red ${c === 'SHOES' ? 'Shoes' : c[0] + c.slice(1).toLowerCase()} model ${i}`, colour: 'Red', material: 'Wood', image_file: 'images/00/' + i + '.jpg', imageSha256: 'h' + i }); }
  fs.mkdirSync(path.join(d, 'data/splits'), { recursive: true });
  fs.writeFileSync(path.join(d, 'data/splits/abo-sample.json'), JSON.stringify(pool));
  const s = node(d, 'scripts/build-sample.cjs', '--accept-shortfall'); assert.strictEqual(s.status, 0, s.stderr);
  const p = node(d, 'scripts/plant.cjs'); assert.strictEqual(p.status, 0, p.stderr);
  const out = s.stdout + s.stderr + p.stdout + p.stderr;
  const held = [...JSON.parse(fs.readFileSync(path.join(d, 'data/heldout/natural-heldout.json'), 'utf8')), ...JSON.parse(fs.readFileSync(path.join(d, 'data/heldout/planted-heldout.json'), 'utf8'))];
  assert.ok(held.length > 100);
  for (const h of held) { assert.ok(!new RegExp('\\b' + h.id + '\\b').test(out), 'held-out id printed'); assert.ok(!out.includes(h.title), 'held-out title printed'); }
  assert.ok(/planted-heldout: \d+ listings/.test(out));
  const dev = JSON.parse(fs.readFileSync(path.join(d, 'data/splits/natural-dev.json'), 'utf8')); assert.ok(dev.length > 0);
  const ids = new Set(), hashes = new Set();
  for (const f of ['data/splits/natural-dev.json', 'data/splits/planted-dev.json', 'data/heldout/natural-heldout.json', 'data/heldout/planted-heldout.json']) for (const r of JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'))) { assert.ok(!ids.has(r.id) && !hashes.has(r.imageSha256)); ids.add(r.id); hashes.add(r.imageSha256); }
});