'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { start } = require('../scripts/serve-demo.cjs');
const get = (port, p) => new Promise((res) => { const q = http.request({ host: '127.0.0.1', port, path: p, method: 'GET' }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res({ status: r.statusCode, body: b })); }); q.end(); });
test('demo server binds loopback only, serves demo/ files, refuses traversal and non-GET', async () => {
  const s = await start(0); const port = s.address().port;
  try {
    assert.strictEqual(s.address().address, '127.0.0.1');
    assert.strictEqual((await get(port, '/live.html')).status, 200);
    assert.strictEqual((await get(port, '/')).status, 200);
    for (const p of ['/../package.json', '/%2e%2e/package.json', '/..%2f..%2fsrc/secrets.cjs', '/nope.html', '/results.json']) assert.ok([403, 404].includes((await get(port, p)).status), p);
    const post = await new Promise((res) => { const q = http.request({ host: '127.0.0.1', port, path: '/', method: 'POST' }, (r) => res(r.statusCode)); q.end(); });
    assert.strictEqual(post, 405);
  } finally { s.close(); }
});