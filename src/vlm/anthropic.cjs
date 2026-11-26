'use strict';
const { ProviderError, mapStatus, postJson } = require('./errors.cjs');
const { getKey } = require('../secrets.cjs');
async function check(a, deps = {}) {
  const key = deps.key || getKey('anthropic');
  const body = {
    model: a.model, max_tokens: a.maxOutputTokens || 600, temperature: 0, system: a.system,
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: a.mime, data: Buffer.from(a.imageBytes).toString('base64') } }, { type: 'text', text: a.userText }] }]
  };
  const t0 = Date.now();
  const r = await postJson('https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body, a.timeoutMs, deps.fetch);
  const latencyMs = Date.now() - t0;
  if (r.status < 200 || r.status >= 300) throw new ProviderError(mapStatus(r.status), r.status, r.retryAfterSec);
  let j;
  try { j = JSON.parse(r.text); } catch (e) { throw new ProviderError('server', r.status); }
  const text = (j.content || []).filter((b) => b && b.type === 'text').map((b) => b.text).join('');
  return { rawText: text, usage: { inputTokens: (j.usage && j.usage.input_tokens) || 0, outputTokens: (j.usage && j.usage.output_tokens) || 0 }, latencyMs };
}
module.exports = { check, name: 'anthropic', host: 'api.anthropic.com' };