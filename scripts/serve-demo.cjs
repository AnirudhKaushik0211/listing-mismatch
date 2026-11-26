'use strict';
// Local-only static server for demo/ (the Live page needs an http origin for its Content Security Policy).
// Binds to 127.0.0.1 only, serves files under demo/ only, GET only. Usage: node scripts/serve-demo.cjs [port]
const http = require('http');
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'demo');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function handler(req, res) {
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (rel === '/') rel = '/index.html';
  const file = path.resolve(DIR, '.' + rel);
  if (file !== DIR && !file.startsWith(DIR + path.sep)) { res.writeHead(403); return res.end(); }
  const type = TYPES[path.extname(file)];
  if (!type || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': type, 'x-content-type-options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
}
function start(port) { return new Promise((r) => { const s = http.createServer(handler); s.listen(port, '127.0.0.1', () => r(s)); }); }
module.exports = { start, handler };
if (require.main === module) start(Number(process.argv[2]) || 8080).then((s) => console.log('Serving demo/ at http://127.0.0.1:' + s.address().port + '/ (local only). Ctrl+C to stop.'));