'use strict';
const core = require('../core/gemini-request.js');
const { ProviderError, postJson } = require('./errors.cjs');
const { getKey } = require('../secrets.cjs');
// Thinking budget is opt-in (env LISTING_VLM_THINKING_BUDGET, integer): models without thinking reject the field.
async function check(a, deps = {}) {
  const key = deps.key || getKey('gemini');
  const tb = process.env.LISTING_VLM_THINKING_BUDGET;
  const req = core.buildGeminiRequest({ model: a.model, system: a.system, userText: a.userText, imageBase64: Buffer.from(a.imageBytes).toString('base64'), mime: a.mime, maxOutputTokens: a.maxOutputTokens || 600, thinkingBudget: tb !== undefined && tb !== '' && Number.isInteger(Number(tb)) ? Number(tb) : undefined });
  const t0 = Date.now();
  const r = await postJson('https://' + req.host + req.path, { [req.headerName]: key }, req.body, a.timeoutMs, deps.fetch);
  const latencyMs = Date.now() - t0;
  if (r.status < 200 || r.status >= 300) throw new ProviderError(core.mapGeminiStatus(r.status, r.text), r.status, r.retryAfterSec);
  let json;
  try { json = JSON.parse(r.text); } catch (e) { throw new ProviderError('server', r.status); }
  try {
    const p = core.parseGeminiResponse(json);
    return { rawText: p.rawText, usage: p.usage, latencyMs, finishReason: p.finishReason };
  } catch (e) { throw new ProviderError(e.kind || 'server', r.status); }
}
module.exports = { check, name: 'gemini', host: core.GEMINI_HOST };