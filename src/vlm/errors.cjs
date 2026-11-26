'use strict';
class ProviderError extends Error {
  constructor(kind, status, retryAfterSec) {
    super(`provider error: ${kind}${status ? ' (' + status + ')' : ''}`); // kind and status only, never headers or body
    this.name = 'ProviderError';
    this.kind = kind;
    this.status = status || 0;
    this.retryAfterSec = retryAfterSec || null;
  }
}
function mapStatus(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'bad_request';
}
// POST JSON with a timeout. Returns {status, text}. Throws ProviderError for timeout and network failures.
async function postJson(url, headers, body, timeoutMs, fetchImpl) {
  const f = fetchImpl || globalThis.fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || 60000);
  try {
    const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    const text = await res.text();
    const ra = res.headers && res.headers.get ? Number(res.headers.get('retry-after')) : NaN;
    return { status: res.status, text, retryAfterSec: Number.isFinite(ra) ? ra : null };
  } catch (e) {
    if (e && e.name === 'AbortError') throw new ProviderError('timeout', 0);
    throw new ProviderError('network', 0);
  } finally { clearTimeout(timer); }
}
module.exports = { ProviderError, mapStatus, postJson };