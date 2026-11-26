'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Lab = require('../labelling/labelling.js');
const { build, render } = require('../scripts/build-labelling.cjs');
const LI = require('../src/core/live-input.js');
const { ROOT, solidJpeg } = require('./helpers.cjs');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const recs = (n) => Array.from({ length: n }, (_, i) => ({ id: 'T' + i, title: 'Title ' + i, image: 'images/x/' + i + '.jpg', category: 'SHOES', attributes: { colour: 'Red', item_type: 'shoes', material: i % 2 ? 'Wood' : null, pattern: null, pack_count: null } }));
const tasksFor = () => build({ 'natural-dev': recs(4), 'natural-heldout': recs(6).map((r) => ({ ...r, id: 'H' + r.id })) });
test('labelling: tasks build is deterministic, has no planted info, and loads through a script context (file:// style)', () => {
  const a = tasksFor(), b = tasksFor();
  assert.deepStrictEqual(a, b); assert.strictEqual(a.tasksHash.length, 64);
  assert.ok(!/planted|mockTruth|verdict/.test(JSON.stringify(a)));
  const ctx = { window: {} }; vm.runInNewContext(render(a), ctx);
  assert.strictEqual(ctx.window.LISTING_TASKS.tasksHash, a.tasksHash);
  assert.deepStrictEqual([...ctx.window.LISTING_TASKS.order['natural-dev']].sort(), a.splits['natural-dev'].map((t) => t.id).sort());
});
test('labelling: state, completeness, label-file build and round trip, validation rejections', () => {
  const tasks = tasksFor(), split = 'natural-dev', state = {};
  const t0 = tasks.splits[split][0];
  Lab.setVerdict(state, t0.id, 'colour', 'mismatch'); assert.ok(!Lab.isComplete(t0, state[t0.id]));
  Lab.setVerdict(state, t0.id, 'item_type', 'match'); assert.ok(Lab.isComplete(t0, state[t0.id]));
  Lab.setTag(state, t0.id, 'colour', 'shade_ambiguity'); Lab.setNote(state, t0.id, 'colour', 'x'.repeat(300));
  assert.strictEqual(state[t0.id].colour.note.length, 200);
  assert.throws(() => Lab.setTag(state, t0.id, 'item_type', 'other')); // tag only with mismatch
  assert.throws(() => Lab.setTag(state, t0.id, 'colour', 'not-a-tag')); assert.throws(() => Lab.setVerdict(state, t0.id, 'colour', 'maybe'));
  Lab.setVerdict(state, t0.id, 'colour', 'match'); assert.strictEqual(state[t0.id].colour.tag, null); // tag cleared when verdict changes
  Lab.setVerdict(state, t0.id, 'colour', 'mismatch'); Lab.setTag(state, t0.id, 'colour', 'other');
  const incomplete = tasks.splits[split][1]; Lab.setVerdict(state, incomplete.id, 'colour', 'match');
  const f = Lab.buildLabelFile(tasks, split, state, new Date('2030-01-01T00:00:00Z'));
  assert.strictEqual(f.labels.length, 1); assert.strictEqual(f.labeller, 'owner'); assert.strictEqual(f.synthetic, false); assert.strictEqual(f.createdAt, '2030-01-01T00:00:00.000Z'); assert.strictEqual(f.schema, 'listing-mismatch-labels/v1');
  assert.deepStrictEqual(Lab.progress(tasks, split, state), { done: 1, total: 4 });
  const ok = Lab.validateLabelFile(JSON.parse(JSON.stringify(f)), tasks, split);
  assert.ok(ok.ok); assert.strictEqual(ok.state[t0.id].colour.verdict, 'mismatch'); assert.strictEqual(ok.state[t0.id].colour.tag, 'other');
  const bad = (m) => Lab.validateLabelFile(m(JSON.parse(JSON.stringify(f))), tasks, split);
  assert.ok(!bad((x) => { x.tasksHash = 'zz'; return x; }).ok); assert.ok(!bad((x) => { x.schema = 'v0'; return x; }).ok);
  assert.ok(!bad((x) => { x.synthetic = true; return x; }).ok); assert.ok(!bad((x) => { x.labeller = 'model'; return x; }).ok);
  assert.ok(!bad((x) => { x.labels[0].attributes.colour.verdict = 'maybe'; return x; }).ok); assert.ok(!bad((x) => { x.labels[0].attributes.item_type.tag = 'other'; return x; }).ok);
  assert.ok(!bad((x) => { x.labels[0].attributes.colour.note = 'n'.repeat(201); return x; }).ok);
  const unk = bad((x) => { x.labels.push({ id: 'nope', attributes: { colour: { verdict: 'match' } } }); return x; }); assert.ok(unk.ok); assert.strictEqual(unk.ignored, 1);
});
test('labelling page boots in a fake DOM: renders a listing, keys set verdicts, download builds a file', () => {
  const tasks = tasksFor();
  const els = {};
  const mkEl = (id) => ({ id, children: [], style: {}, listeners: {}, hidden: false, textContent: '', value: '', set className(v) { this._c = v; }, appendChild(c) { this.children.push(c); this.textContent = ''; if (!this.value && c.value) this.value = c.value; return c; }, addEventListener(t, f) { this.listeners[t] = f; }, click() { /* download */ } });
  const get = (id) => (els[id] = els[id] || mkEl(id));
  const docListeners = {};
  let blobText = null;
  const document = { getElementById: get, createElement: (t) => ({ ...mkEl(t), tagName: t.toUpperCase() }), addEventListener: (t, f) => { docListeners[t] = f; }, body: { appendChild() {}, removeChild() {} } };
  const store = {};
  const win = { LISTING_TASKS: tasks, localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } }, document };
  const ctx = { window: win, document, Blob: class { constructor(p) { blobText = p.join(''); } }, URL: { createObjectURL: () => 'blob:x' }, FileReader: class {}, console };
  win.window = win; ctx.globalThis = ctx;
  vm.runInNewContext(read('labelling/labelling.js'), ctx);
  assert.ok(get('progress').textContent.startsWith('0 / 4 complete'));
  assert.ok(get('image').src.startsWith('../data/images/')); assert.ok(get('attrs').children.length >= 2);
  docListeners.keydown({ key: '1', target: { tagName: 'BODY' } }); docListeners.keydown({ key: '2', target: { tagName: 'BODY' } });
  assert.ok(get('progress').textContent.startsWith('1 / 4 complete'));
  assert.ok(Object.keys(store).some((k) => k.startsWith('listingMismatchLabels:v1:' + tasks.tasksHash))); // autosave
  get('download').listeners.click();
  const f = JSON.parse(blobText); assert.strictEqual(f.labels.length, 1); assert.strictEqual(f.tasksHash, tasks.tasksHash);
});
test('the committed tasks.js (if generated) parses and its hash is self-consistent', () => {
  const p = path.join(ROOT, 'labelling/tasks.js');
  if (!fs.existsSync(p)) return;
  const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(p, 'utf8'), ctx);
  const t = ctx.window.LISTING_TASKS; const { tasksHash, ...body } = t;
  assert.strictEqual(require('../src/hash.cjs').sha256(require('../src/hash.cjs').canonical(body)), tasksHash);
  assert.ok(!/planted/.test(JSON.stringify(t)));
});
const B = (arr) => Uint8Array.from(arr);
test('live-input: cap, types and sizes, schema, unknown columns, file match', () => {
  const ok = { title: 'T', colour: 'Red', item_type: 'shoes', image_filename: 'a.jpg' };
  assert.ok(LI.validateRecords([ok], ['a.jpg']).ok);
  const many = Array.from({ length: 26 }, () => ok); const v = LI.validateRecords(many, ['a.jpg']);
  assert.ok(!v.ok && /cap is 25/.test(v.errors[0].msg) && v.listings.length === 0);
  assert.ok(LI.validateRecords(Array.from({ length: 25 }, () => ok), ['a.jpg']).ok);
  for (const [bad, re] of [[{ ...ok, extra: 1 }, /unknown column/], [{ ...ok, title: '' }, /missing title/], [{ ...ok, title: 'x'.repeat(251) }, /250/], [{ ...ok, colour: 'x'.repeat(81) }, /80/], [{ ...ok, pack_count: '0' }, /pack_count/], [{ ...ok, pack_count: '101' }, /pack_count/], [{ ...ok, pack_count: '2.5' }, /pack_count/], [{ ...ok, image_filename: 'b.jpg' }, /not selected/]]) {
    const r = LI.validateRecords([bad], ['a.jpg']); assert.ok(!r.ok && re.test(r.errors[0].msg), JSON.stringify(bad));
  }
  assert.strictEqual(LI.checkImage(B([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).mime, 'image/jpeg');
  assert.strictEqual(LI.checkImage(B([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0])).mime, 'image/png');
  assert.strictEqual(LI.checkImage(B([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])).mime, 'image/webp');
  assert.ok(!LI.checkImage(B([0x47, 0x49, 0x46, 0x38, 0, 0, 0, 0, 0, 0, 0, 0, 0])).ok); // GIF refused by magic bytes
  assert.ok(!LI.checkImage(new Uint8Array(4 * 1024 * 1024 + 1)).ok);
});
test('live-input: CSV parse, export neutralises formulas and quotes every cell, key redaction, demo mock stamp', () => {
  const rows = LI.parseCsv('title,colour,item_type,image_filename\r\n"A, B",Red,shoes,a.jpg\r\n"He said ""hi""",Blue,chair,b.jpg\r\n');
  assert.strictEqual(rows.length, 2); assert.strictEqual(rows[0].title, 'A, B'); assert.strictEqual(rows[1].title, 'He said "hi"');
  const csv = LI.toCsv([{ row: 1, image_filename: '=cmd', title: '+SUM(1)', attribute: '-x', listing_value: '@y', verdict: 'match', effective_verdict: 'match', confidence: 0.5, reason: 'a "q"', stamp: LI.MOCK_STAMP }]);
  const line = csv.split('\r\n')[1];
  assert.ok(line.includes('"\'=cmd"') && line.includes('"\'+SUM(1)"') && line.includes('"\'-x"') && line.includes('"\'@y"') && line.includes('"a ""q"""'));
  assert.ok(line.startsWith('"') && line.endsWith('"') && line.split('","').length === 10); // every one of the 10 cells is quoted
  assert.strictEqual(LI.redact('error with MYKEY-12345 inside', 'MYKEY-12345'), 'error with [redacted] inside');
  const googleKey = 'AI' + 'za' + 'Z'.repeat(35); assert.strictEqual(LI.redact('x ' + googleKey), 'x [redacted]');
  const m = LI.demoMock('a.jpg', 'colour'); assert.strictEqual(m.confidence, 0.5); assert.strictEqual(m.reason, 'demo mock, no model called'); assert.deepStrictEqual(LI.demoMock('a.jpg', 'colour'), m);
  assert.strictEqual(LI.MOCK_STAMP, 'MOCK, NOT A MEASUREMENT');
});
test('live page logic end to end in a Node vm with the mock provider (load file, validate, run, export)', async () => {
  const ctx = { window: {}, console }; ctx.globalThis = ctx;
  vm.runInNewContext(read('demo/core.bundle.js'), ctx);
  const C = ctx.window.ListingCore;
  const csv = 'title,colour,item_type,image_filename\n"Red Shoes",Red,shoes,a.jpg\nBlue Chair,Blue,chair,b.jpg\n';
  const records = C.parseRecords(csv, 'csv');
  const v = C.validateRecords(records, ['a.jpg', 'b.jpg']); assert.ok(v.ok);
  const results = await C.runBatch({ listings: v.listings, provider: 'mock', concurrency: 2 });
  assert.strictEqual(results.length, 2);
  const rows = C.flattenResults(results, 0.7, true);
  assert.strictEqual(rows.length, 4); assert.ok(rows.every((r) => r.stamp === 'MOCK, NOT A MEASUREMENT' && ['match', 'mismatch', 'cannot_tell'].includes(r.effective_verdict)));
  assert.ok(C.toCsv(rows).includes('MOCK, NOT A MEASUREMENT'));
  // real-provider path with an injected call: parse failure is retried once, an auth error stops the batch without echoing the key
  let n = 0;
  const good = JSON.stringify({ attributes: { colour: { verdict: 'match', confidence: 0.9, reason: 'ok' }, item_type: { verdict: 'match', confidence: 0.9, reason: 'ok' } } });
  const r2 = await C.runBatch({ listings: v.listings.slice(0, 1), provider: 'gemini', call: async () => (++n === 1 ? { rawText: 'oops' } : { rawText: good }) });
  assert.strictEqual(n, 2); assert.strictEqual(r2[0].attributes.colour.verdict, 'match');
  await assert.rejects(C.runBatch({ listings: v.listings, provider: 'gemini', call: async () => { const e = new Error('The key was rejected.'); e.kind = 'auth'; throw e; } }), (e) => e.kind === 'auth');
});
test('published demo/results.js carries no gate wording, PASS/FAIL or criteria', () => {
  const t = read('demo/results.js');
  assert.ok(!/"(PASS|FAIL)"|PASS|FAIL|criteria|"status"|"planted":|"natural":|"g04"|INCONCLUSIVE|NOT EVALUABLE/.test(t.replace(/"planted(Table)?"/g, '')), 'results.js has gate wording');
  assert.ok(!/criteria/.test(t));
});
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, '');
test('static checks: results page and labelling page are network-free; live page is locked down', () => {
  for (const f of ['demo/index.html', 'demo/demo.js', 'labelling/index.html', 'labelling/labelling.js']) {
    const t = strip(read(f));
    assert.ok(!/https?:\/\//i.test(t), f + ' has a remote reference'); assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(t), f + ' makes requests');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(/.test(t), f + ' uses unsafe DOM APIs');
  }
  for (const f of ['demo/index.html', 'labelling/index.html']) {
    const t = read(f); assert.ok(/connect-src 'none'/.test(t)); assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(t), f + ' has an inline script'); assert.ok(!/\son[a-z]+\s*=/.test(t), f + ' has an inline handler');
  }
  const html = read('demo/live.html');
  assert.ok(html.includes(`content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src https://generativelanguage.googleapis.com; base-uri 'none'; form-action 'none'"`));
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<title>'));
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html) && !/\son[a-z]+\s*=/.test(html));
  for (const f of ['demo/live.js', 'demo/live-logic.js', 'demo/core.bundle.js', 'demo/live.html']) {
    const t = read(f);
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|localStorage/.test(t), f);
    const hosts = (t.match(/https?:\/\/[A-Za-z0-9.-]+/g) || []).filter((h) => !/^https?:\/\/(generativelanguage\.googleapis\.com)$/.test(h));
    assert.deepStrictEqual(hosts, [], f + ' mentions another host');
  }
  assert.ok(!/sessionStorage|remember/i.test(read('demo/live.js')) && !/remember/i.test(html), 'key is memory-only');
  assert.ok(/window\.top !== window\.self/.test(read('demo/live.js')), 'frame check');
  assert.ok(read('demo/live-logic.js').includes('about 20 requests per day, 5 per minute'), 'Live page explains quota failures');
  assert.ok(/type="password" autocomplete="off"/.test(html));
  assert.ok(read('demo/index.html').includes('Built with AI coding agents; Anirudh wrote the spec, gates and reviews.') && html.includes('Built with AI coding agents; Anirudh wrote the spec, gates and reviews.'));
  void solidJpeg;
});
test('pilot page data: stamped, dev-only, Wilson intervals, images present, no verdict wording, text-only rendering', () => {
  const ctx = { window: {} }; vm.runInNewContext(read('demo/pilot.js'), ctx);
  const P = ctx.window.LISTING_PILOT;
  assert.strictEqual(P.stamp, 'PILOT ON PRACTICE (DEV) DATA, NOT THE PRE-REGISTERED EVALUATION; full evaluation in progress');
  assert.ok(P.examples.length === P.sizes.planted + P.sizes.natural && P.examples.every((x) => /-dev$/.test(x.set)));
  for (const x of P.examples) assert.ok(fs.existsSync(path.join(ROOT, 'demo', x.image)), x.image);
  const cells = P.planted.rows.concat(P.planted.baselineRows).flatMap((r) => r.slice(5)).concat(P.natural.rows.flatMap((r) => r.slice(4)));
  assert.ok(cells.length && cells.every((c) => /\d+\/\d+ = [\d.]+ \(95% interval [\d.]+ to [\d.]+\)/.test(c)), 'every shown proportion carries a Wilson interval');
  const all = read('demo/pilot.js') + read('demo/demo.js') + read('demo/index.html');
  assert.ok(!/\b(PASS|FAIL|gate)\b/i.test(all.replace(/pre-registered/g, '')), 'no verdict wording');
  assert.ok(!/https?:\/\/|innerHTML|fetch\s*\(/.test(read('demo/demo.js')));
  assert.ok(P.examples.every((x) => x.attributes.every((a) => a.verdict && typeof a.confidence === 'number')));
  assert.ok(/MOCK/.test(read('demo/demo.js')), 'mock section keeps its label');
});
