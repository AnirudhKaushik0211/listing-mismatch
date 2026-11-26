'use strict';
// The only module that reads API key environment variables.
const NAMES = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY' };
const ALL = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'];
function keyName(provider) { return NAMES[provider] || null; }
function getKey(provider) {
  const n = NAMES[provider];
  if (!n) return null;
  const v = process.env[n];
  return v && v.trim() ? v.trim() : null;
}
function knownValues() {
  return ALL.map((n) => process.env[n]).filter((v) => v && v.length >= 8);
}
function redact(str) {
  let s = String(str === undefined || str === null ? '' : str);
  for (const v of knownValues()) s = s.split(v).join('[redacted]');
  return s.replace(/AIza[0-9A-Za-z_\-]{35}/g, '[redacted]').replace(/sk-(ant-)?[A-Za-z0-9_\-]{20,}/g, '[redacted]');
}
module.exports = { getKey, keyName, redact, knownValues };