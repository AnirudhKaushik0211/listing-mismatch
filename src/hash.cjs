'use strict';
const fs = require('fs');
const crypto = require('crypto');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
function normText(buf) {
  let s = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/\r\n/g, '\n');
}
const textHash = (s) => sha256(normText(s));
const fileHash = (p) => textHash(fs.readFileSync(p));
const bytesHash = (b) => crypto.createHash('sha256').update(b).digest('hex');
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.keys(v).sort().reduce((o, k) => { o[k] = sortKeys(v[k]); return o; }, {});
  return v;
}
const canonical = (v) => JSON.stringify(sortKeys(v));
// Manifest canonical form: array sorted by id, one record per line, LF, trailing LF.
function canonicalManifest(records) {
  const rs = [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return '[\n' + rs.map((r) => canonical(r)).join(',\n') + '\n]\n';
}
module.exports = { sha256, textHash, fileHash, bytesHash, canonical, canonicalManifest, normText, sortKeys };