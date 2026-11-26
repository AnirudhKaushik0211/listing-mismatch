'use strict';
// Provider selection, retries, concurrency, cache, circuit breaker, cost guard (SPEC 4.5).
const fs = require('fs');
const path = require('path');
const { buildPrompt } = require('../core/prompt.js');
const { parseOutput, failedAttributes } = require('../core/parse.js');
const { sha256 } = require('../hash.cjs');
const { ProviderError } = require('./errors.cjs');
const mock = require('./mock.cjs');
const log = require('../log.cjs');
const ADAPTERS = { gemini: () => require('./gemini.cjs'), openai: () => require('./openai.cjs'), anthropic: () => require('./anthropic.cjs'), mock: () => mock };
const PROVIDERS = Object.keys(ADAPTERS);
class RunError extends Error { constructor(m, exitCode) { super(m); this.exitCode = exitCode; } }
const WAITS = [1000, 2000, 4000];
// Output cap per request. 600 truncated thinking models (dev-sub1, 2026-11-25); part of the hashed method (stage 2 code hash).
const MAX_OUTPUT_TOKENS = 2048;
const sanitise = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, '_');
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Refuses aliases (SPEC 10.2). Returns {ok, note}.
function checkModelId(id) {
  if (!id || /\s/.test(id)) return { ok: false, note: 'empty or contains whitespace' };
  if (/latest|auto|alias/i.test(id)) return { ok: false, note: 'alias-style identifier' };
  if (/-(\d{3}|\d{8}|\d{4}-\d{2}-\d{2})$/.test(id)) return { ok: true, note: 'dated snapshot, as named by the provider' };
  return { ok: true, note: 'model not pinned by the provider' };
}
function estimate(listings, prices, provider, model) {
  let inTok = 0;
  for (const l of listings) { const p = buildPrompt(l); inTok += 800 + Math.ceil((p.system.length + p.userText.length) / 4); }
  const outTok = listings.length * 150;
  const pr = prices && prices[provider + '/' + model];
  const cost = pr ? (inTok * pr.inputPerMillion + outTok * pr.outputPerMillion) / 1e6 : null;
  return { listings: listings.length, inputTokens: inTok, outputTokens: outTok, costUsd: cost };
}
function readImage(root, rel) {
  const bytes = fs.readFileSync(path.join(root, rel));
  return { bytes, mime: bytes[0] === 0x89 ? 'image/png' : 'image/jpeg' };
}
async function runVlm(o) {
  const { listings, provider, model, imageRoot } = o;
  if (!PROVIDERS.includes(provider)) throw new RunError('unknown provider', 1);
  const isMock = provider === 'mock';
  if (!isMock) {
    if (!model) throw new RunError('missing model: set LISTING_VLM_MODEL or --model', 1);
    const m = checkModelId(model);
    if (!m.ok) throw new RunError('model identifier refused: ' + m.note, 1);
  }
  const adapter = (o.adapters && o.adapters[provider]) || ADAPTERS[provider]();
  const est = estimate(listings, o.prices, provider, model);
  if (!isMock && !o.yes) return { needsConfirm: true, estimate: est, records: [] };
  const sleep = o.sleep || defaultSleep;
  const concurrency = Math.min(o.concurrency || (provider === 'gemini' ? 2 : 4), 8);
  const records = new Array(listings.length);
  const stats = { calls: 0, cacheHits: 0, failures: 0, parseRetries: 0 };
  let consecutive = 0, abort = null, next = 0, anySuccess = false;
  // Optional pacing for low free-tier limits: at most one provider call per minIntervalMs, retries included.
  let nextSlot = 0;
  const pace = async () => { if (!o.minIntervalMs) return; const now = Date.now(); const wait = Math.max(0, nextSlot - now); nextSlot = Math.max(now, nextSlot) + o.minIntervalMs; if (wait) await sleep(wait); };
  const cacheRoot = o.cacheDir && !isMock ? path.join(o.cacheDir, provider, sanitise(model)) : null;

  async function callWithRetries(args) {
    for (let attempt = 0; ; attempt++) {
      if (o.maxCalls && stats.calls >= o.maxCalls) throw new RunError('max calls reached', 4);
      stats.calls++;
      await pace();
      try { return await adapter.check(args, { fetch: o.fetchImpl, key: o.key }); }
      catch (e) {
        if (!(e instanceof ProviderError)) throw e;
        if (e.kind === 'auth' || e.kind === 'bad_request') throw new RunError(`provider fatal: ${e.kind} (${e.status})`, 3);
        if (e.kind === 'blocked') throw e;
        if (attempt >= WAITS.length) throw e;
        const w = e.retryAfterSec && e.retryAfterSec <= 30 ? e.retryAfterSec * 1000 : WAITS[attempt];
        log.warn(`retry ${attempt + 1} after ${e.kind}`);
        await sleep(w);
      }
    }
  }
  async function one(i) {
    const l = listings[i];
    const p = buildPrompt(l);
    const base = { id: l.id, checker: 'vlm', provider, model: isMock ? 'mock' : model, promptHash: p.promptHash, attributes: {}, usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0, error: null, cached: false };
    const img = readImage(imageRoot, l.image);
    const key = sha256([provider, model, p.promptHash, l.imageSha256, sha256(p.userText)].join('|'));
    const cacheFile = cacheRoot ? path.join(cacheRoot, key + '.json') : null;
    if (cacheFile && fs.existsSync(cacheFile)) {
      const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      stats.cacheHits++;
      return { ...base, attributes: c.attributes, usage: c.usage, latencyMs: c.latencyMs, cached: true };
    }
    const args = { imageBytes: img.bytes, mime: img.mime, userText: p.userText, system: p.system, model, timeoutMs: 60000, maxOutputTokens: MAX_OUTPUT_TOKENS, listing: l, requested: p.requested };
    let parsed = null, res = null;
    for (let t = 0; t < 2; t++) {
      try { res = await callWithRetries(args); }
      catch (e) {
        if (e instanceof RunError) throw e;
        if (e instanceof mock.MockRefusal || e.exitCode) throw e;
        const kind = e instanceof ProviderError ? e.kind : 'network';
        return { ...base, attributes: failedAttributes(p.requested, 'provider_error').attributes, error: 'provider_error:' + kind };
      }
      parsed = parseOutput(res.rawText, p.requested);
      if (parsed.ok) break;
      stats.parseRetries++;
    }
    if (!parsed.ok) return { ...base, attributes: parsed.attributes, usage: res.usage, latencyMs: res.latencyMs, error: 'parse_error', finishReason: res.finishReason || null };
    if (cacheFile) { fs.mkdirSync(cacheRoot, { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify({ rawText: res.rawText, attributes: parsed.attributes, usage: res.usage, latencyMs: res.latencyMs })); }
    return { ...base, attributes: parsed.attributes, usage: res.usage, latencyMs: res.latencyMs };
  }
  async function worker() {
    while (!abort) {
      const i = next++;
      if (i >= listings.length) return;
      try {
        records[i] = await one(i);
        if (records[i].error) { stats.failures++; consecutive++; } else { consecutive = 0; anySuccess = true; }
        if (consecutive >= 5) abort = new RunError('circuit breaker: 5 consecutive failures', 4);
      } catch (e) { abort = e instanceof RunError || e.exitCode ? e : new RunError('internal error', 1); }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (abort) { abort.partial = records.filter(Boolean); abort.stats = stats; throw abort; }
  if (listings.length && stats.failures / listings.length > 0.10) { const e = new RunError('more than 10% of listings failed', 4); e.partial = records; e.stats = stats; throw e; }
  return { records, stats, estimate: est, anySuccess };
}
// Writes the records an aborted run produced (failures included) so they can be diagnosed. Returns the file path or null.
function writePartial(outDir, name, checker, err) {
  const recs = (err && err.partial ? err.partial : []).filter(Boolean);
  if (!recs.length) return null;
  const f = path.join(outDir, name + '.' + checker + '.partial.jsonl');
  fs.writeFileSync(f, recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return f;
}
module.exports = { runVlm, checkModelId, estimate, writePartial, RunError, PROVIDERS, MAX_OUTPUT_TOKENS };