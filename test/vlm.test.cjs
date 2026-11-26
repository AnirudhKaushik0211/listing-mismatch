'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const gemini = require('../src/vlm/gemini.cjs');
const openai = require('../src/vlm/openai.cjs');
const anthropic = require('../src/vlm/anthropic.cjs');
const { runVlm, checkModelId, RunError, writePartial, MAX_OUTPUT_TOKENS } = require('../src/vlm/client.cjs');
const { ProviderError } = require('../src/vlm/errors.cjs');
const { ROOT, fixture } = require('./helpers.cjs');
const KEY = 'TESTKEY-not-a-real-key-0123456789';
const A = { imageBytes: Buffer.from([1, 2, 3]), mime: 'image/jpeg', userText: 'u', system: 's', model: 'm-1', timeoutMs: 1000, maxOutputTokens: 600 };
const resp = (status, body, headers = {}) => ({ status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), headers: { get: (k) => headers[k.toLowerCase()] || null } });
const stub = (r) => { const calls = []; const f = async (url, init) => { calls.push({ url, init }); return typeof r === 'function' ? r(calls.length) : r; }; f.calls = calls; return f; };
test('adapters build requests with the key only in a header and parse recorded responses', async () => {
  const g = stub(resp(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'T' }] } }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 } }));
  const r = await gemini.check(A, { fetch: g, key: KEY });
  assert.strictEqual(r.rawText, 'T'); assert.deepStrictEqual(r.usage, { inputTokens: 3, outputTokens: 2 });
  assert.strictEqual(g.calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/m-1:generateContent');
  assert.strictEqual(g.calls[0].init.headers['x-goog-api-key'], KEY); assert.ok(!g.calls[0].url.includes(KEY) && !g.calls[0].init.body.includes(KEY));
  assert.strictEqual(JSON.parse(g.calls[0].init.body).generationConfig.temperature, 0);
  const o = stub(resp(200, { choices: [{ message: { content: 'O' } }], usage: { prompt_tokens: 4, completion_tokens: 1 } }));
  const ro = await openai.check(A, { fetch: o, key: KEY });
  assert.strictEqual(ro.rawText, 'O'); assert.strictEqual(o.calls[0].init.headers.authorization, 'Bearer ' + KEY);
  const ob = JSON.parse(o.calls[0].init.body); assert.strictEqual(ob.temperature, 0); assert.strictEqual(ob.response_format.type, 'json_object'); assert.ok(ob.messages[1].content[1].image_url.url.startsWith('data:image/jpeg;base64,'));
  const a = stub(resp(200, { content: [{ type: 'text', text: 'A1' }, { type: 'text', text: 'A2' }], usage: { input_tokens: 5, output_tokens: 2 } }));
  const ra = await anthropic.check(A, { fetch: a, key: KEY });
  assert.strictEqual(ra.rawText, 'A1A2'); assert.strictEqual(a.calls[0].init.headers['x-api-key'], KEY); assert.strictEqual(a.calls[0].init.headers['anthropic-version'], '2023-06-01');
});
test('each error status maps to the right kind and messages never contain the key', async () => {
  const cases = [[400, 'bad_request'], [401, 'auth'], [403, 'auth'], [429, 'rate_limit'], [500, 'server'], [503, 'server']];
  for (const ad of [gemini, openai, anthropic]) for (const [s, k] of cases) {
    await assert.rejects(ad.check(A, { fetch: stub(resp(s, 'body ' + KEY)), key: KEY }), (e) => e instanceof ProviderError && e.kind === k && e.status === s && !e.message.includes(KEY) && !String(e.stack).includes('body'));
  }
  await assert.rejects(gemini.check(A, { fetch: async () => { throw new Error('boom ' + KEY); }, key: KEY }), (e) => e.kind === 'network' && !e.message.includes(KEY));
  await assert.rejects(gemini.check(A, { fetch: stub(resp(200, { candidates: [{ finishReason: 'SAFETY' }] })), key: KEY }), (e) => e.kind === 'blocked');
});
test('model identifier pinning rule', () => {
  for (const ok of ['gemini-2.0-flash-001', 'gpt-4o-2024-08-06', 'gemini-2.5-flash']) assert.ok(checkModelId(ok).ok, ok);
  assert.strictEqual(checkModelId('gemini-2.0-flash-001').note, 'dated snapshot, as named by the provider');
  assert.strictEqual(checkModelId('gpt-4o-2024-08-06').note, 'dated snapshot, as named by the provider');
  assert.strictEqual(checkModelId('gemini-2.5-flash').note, 'model not pinned by the provider');
  for (const bad of ['gemini-flash-latest', 'latest', 'auto', 'a b', '', 'my-alias']) assert.ok(!checkModelId(bad).ok, bad);
});
const listings = () => fixture('fixture-natural.json').slice(0, 3);
const imageRoot = path.join(ROOT, 'test', 'fixtures');
const goodRaw = (l) => JSON.stringify({ attributes: Object.fromEntries(Object.keys(l.attributes).filter((k) => l.attributes[k] !== null).map((k) => [k, { verdict: 'match', confidence: 0.9, reason: 'ok' }])) });
test('client: cache hit avoids a call; retries wait 1, 2, 4 s; --yes guard', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmc-'));
  let n = 0;
  const adapter = { check: async (a) => { n++; return { rawText: goodRaw(a.listing), usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 5 }; } };
  const base = { listings: listings(), provider: 'gemini', model: 'gemini-test-model', imageRoot, cacheDir, adapters: { gemini: adapter }, key: 'k', sleep: async () => {} };
  const guard = await runVlm({ ...base, yes: false });
  assert.ok(guard.needsConfirm); assert.strictEqual(n, 0); assert.strictEqual(guard.estimate.listings, 3);
  const r1 = await runVlm({ ...base, yes: true }); assert.strictEqual(n, 3); assert.strictEqual(r1.stats.cacheHits, 0);
  const r2 = await runVlm({ ...base, yes: true }); assert.strictEqual(n, 3); assert.strictEqual(r2.stats.cacheHits, 3); assert.ok(r2.records.every((r) => r.cached));
  for (const f of fs.readdirSync(path.join(cacheDir, 'gemini', 'gemini-test-model'))) assert.ok(!fs.readFileSync(path.join(cacheDir, 'gemini', 'gemini-test-model', f), 'utf8').includes('key'));
  const waits = []; let k = 0;
  const flaky = { check: async (a) => { if (k++ < 3) throw new ProviderError('rate_limit', 429); return { rawText: goodRaw(a.listing), usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 }; } };
  const r3 = await runVlm({ ...base, listings: listings().slice(0, 1), cacheDir: null, adapters: { gemini: flaky }, yes: true, sleep: async (ms) => waits.push(ms) });
  assert.deepStrictEqual(waits, [1000, 2000, 4000]); assert.strictEqual(r3.records[0].error, null);
});
test('client: requests ask for MAX_OUTPUT_TOKENS (2048) output tokens', async () => {
  const seen = [];
  const adapter = { check: async (a) => { seen.push(a.maxOutputTokens); return { rawText: goodRaw(a.listing), usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 }; } };
  await runVlm({ listings: listings().slice(0, 1), provider: 'gemini', model: 'gemini-test-model', imageRoot, cacheDir: null, adapters: { gemini: adapter }, key: 'k', yes: true, sleep: async () => {} });
  assert.strictEqual(MAX_OUTPUT_TOKENS, 2048); assert.deepStrictEqual(seen, [2048]);
});
test('client: an aborted run keeps its partial records, failures included, and writePartial saves them', async () => {
  const bad = listings()[1].id;
  const adapter = { check: async (a) => (a.listing.id === bad ? { rawText: 'not json', usage: { inputTokens: 1, outputTokens: 2048 }, latencyMs: 1, finishReason: 'MAX_TOKENS' } : { rawText: goodRaw(a.listing), usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 }) };
  const err = await runVlm({ listings: listings(), provider: 'gemini', model: 'gemini-test-model', imageRoot, cacheDir: null, adapters: { gemini: adapter }, key: 'k', yes: true, concurrency: 1, sleep: async () => {} }).then(() => null, (e) => e);
  assert.ok(err instanceof RunError && /10%/.test(err.message));
  const failed = err.partial.filter((r) => r && r.error === 'parse_error');
  assert.ok(failed.length >= 1); assert.strictEqual(failed[0].finishReason, 'MAX_TOKENS');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmp-'));
  const f = writePartial(dir, 'planted-dev', 'vlm', err);
  assert.strictEqual(fs.readFileSync(f, 'utf8').trim().split('\n').length, err.partial.filter(Boolean).length);
  assert.strictEqual(writePartial(dir, 'x', 'vlm', new RunError('no partial', 4)), null);
});
test('client: minIntervalMs paces every provider call', async () => {
  const waits = [];
  const adapter = { check: async (a) => ({ rawText: goodRaw(a.listing), usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 }) };
  await runVlm({ listings: listings(), provider: 'gemini', model: 'gemini-test-model', imageRoot, cacheDir: null, adapters: { gemini: adapter }, key: 'k', yes: true, concurrency: 1, minIntervalMs: 13000, sleep: async (ms) => waits.push(ms) });
  assert.strictEqual(waits.length, 2); assert.ok(waits[0] > 12000 && waits[0] <= 13000 && waits[1] - waits[0] > 12000); // the fake sleep does not advance the clock
});
test('client: parse failure retried once then flagged; blocked continues; auth aborts exit 3; breaker exit 4; max calls', async () => {
  const mk = (check) => ({ listings: listings(), provider: 'gemini', model: 'gemini-test-model', imageRoot, cacheDir: null, adapters: { gemini: { check } }, key: 'k', sleep: async () => {}, yes: true, concurrency: 1 });
  let calls = 0;
  const garbage = async () => { calls++; return { rawText: 'garbage', usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 1 }; };
  const failed = await runVlm({ ...mk(garbage), listings: listings().slice(0, 1) }).catch((e) => e);
  assert.strictEqual(calls, 2); // one retry, then the listing is flagged
  assert.strictEqual(failed.exitCode, 4); // one failed listing is over 10% of the set
  assert.strictEqual(failed.partial[0].error, 'parse_error'); assert.ok(Object.values(failed.partial[0].attributes).every((a) => a.verdict === 'cannot_tell' && a.flags.includes('parse_error')));
  const blocked = await runVlm({ ...mk(async (a) => { if (a.listing.id === 'FX-N01') throw new ProviderError('blocked', 200); return { rawText: goodRaw(a.listing), usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 }; }), listings: listings() }).catch((e) => e);
  assert.strictEqual(blocked.exitCode, 4); // 1 of 3 failed (over 10%) but the run continued past the blocked listing
  const part = blocked.partial; assert.strictEqual(part.length, 3); assert.ok(part.some((x) => x.error && x.error.startsWith('provider_error') && Object.values(x.attributes).every((a) => a.flags.includes('provider_error'))));
  await assert.rejects(runVlm(mk(async () => { throw new ProviderError('auth', 401); })), (e) => e.exitCode === 3);
  await assert.rejects(runVlm({ ...mk(async () => { throw new ProviderError('server', 500); }), listings: fixture('fixture-planted.json') }), (e) => e.exitCode === 4); // circuit breaker
  await assert.rejects(runVlm({ ...mk(async (a) => ({ rawText: goodRaw(a.listing), usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 1 })), maxCalls: 1 }), (e) => e.exitCode === 4);
  await assert.rejects(runVlm({ ...mk(async () => ({})), model: 'gemini-flash-latest' }), (e) => e.exitCode === 1);
  await assert.rejects(runVlm({ ...mk(async () => ({})), model: null }), (e) => e.exitCode === 1);
});
test('client with the mock provider needs no key or model and never caches', async () => {
  const r = await runVlm({ listings: fixture('fixture-planted.json'), provider: 'mock', imageRoot, cacheDir: os.tmpdir(), yes: false });
  assert.strictEqual(r.records.length, 10); assert.ok(r.records.every((x) => x.provider === 'mock' && x.model === 'mock'));
  const again = await runVlm({ listings: fixture('fixture-planted.json'), provider: 'mock', imageRoot });
  assert.deepStrictEqual(r.records, again.records); // deterministic
});