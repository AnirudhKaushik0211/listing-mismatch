'use strict';
const { ProviderError, mapStatus, postJson } = require('./errors.cjs');
const { getKey } = require('../secrets.cjs');
async function check(a, deps = {}) {
  const key = deps.key || getKey('openai');
  const body = {
    model: a.model, temperature: 0, max_completion_tokens: a.maxOutputTokens || 600,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: a.system },
      { role: 'user', content: [{ type: 'text', text: a.userText }, { type: 'image_url', image_url: { url: `data:${a.mime};base64,${Buffer.from(a.imageBytes).toString('base64')}`, detail: 'low' } }] }
    ]
  };
  const t0 = Date.now();
  const r = await postJson('https://api.openai.com/v1/chat/completions', { authorization: 'Bearer ' + key }, body, a.timeoutMs, deps.fetch);
  const latencyMs = Date.now() - t0;
  if (r.status < 200 || r.status >= 300) throw new ProviderError(mapStatus(r.status), r.status, r.retryAfterSec);
  let j;
  try { j = JSON.parse(r.text); } catch (e) { throw new ProviderError('server', r.status); }
  const ch = j.choices && j.choices[0];
  if (!ch || (ch.finish_reason === 'content_filter')) throw new ProviderError('blocked', r.status);
  return { rawText: (ch.message && ch.message.content) || '', usage: { inputTokens: (j.usage && j.usage.prompt_tokens) || 0, outputTokens: (j.usage && j.usage.completion_tokens) || 0 }, latencyMs };
}
module.exports = { check, name: 'openai', host: 'api.openai.com' };