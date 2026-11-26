/* Live page: runs the shared ListingCore detector on custom listings. Key lives in memory only. */
(function () {
  'use strict';
  // Refuse to run inside a frame (meta CSP cannot set frame-ancestors).
  if (window.top !== window.self) { document.body.textContent = 'This page does not run inside a frame. Open it directly.'; return; }
  var C = window.ListingCore;
  var $ = function (id) { return document.getElementById(id); };
  var TAU = 0.7;
  var key = '';
  var results = [], files = {}, stopped = false, lastMock = true, failures = {};

  function setMessage(t) { $('message').textContent = C.redact(t, key); }
  function init() {
    $('model').textContent = C.PINNED_MODEL || 'not pinned yet (real mode disabled; demo mock only)';
    $('modelNote').textContent = C.PINNED_MODEL ? 'Same identifier as eval/freeze.json. Live results are not part of the gate.' : '';
    if (!C.PINNED_MODEL) { var o = $('provider').querySelector('option[value=gemini]'); o.disabled = true; }
    $('clearKey').addEventListener('click', function () { key = ''; $('key').value = ''; setMessage('Key cleared.'); });
    $('key').addEventListener('input', function () { key = $('key').value; });
    $('runSingle').addEventListener('click', runSingle);
    $('runBatch').addEventListener('click', runBatch);
    $('stop').addEventListener('click', function () { stopped = true; setMessage('Stopping after the requests in flight.'); });
    $('exportCsv').addEventListener('click', function () { download('listing-check.csv', 'text/csv', C.toCsv(C.flattenResults(results, TAU, lastMock))); });
    $('exportJson').addEventListener('click', function () { download('listing-check.json', 'application/json', JSON.stringify(C.flattenResults(results, TAU, lastMock), null, 1)); });
  }
  function download(name, type, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  function readBytes(file) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(new Uint8Array(r.result)); }; r.onerror = rej; r.readAsArrayBuffer(file); });
  }
  function b64(bytes) { var s = '', i; for (i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function geminiCall(listing, prompt, bytes, mime) {
    var req = C.buildGeminiRequest({ model: C.PINNED_MODEL, system: prompt.system, userText: prompt.userText, imageBase64: b64(bytes), mime: mime, maxOutputTokens: 2048 });
    var waits = [1000, 2000, 4000];
    for (var attempt = 0; ; attempt++) {
      var res;
      try {
        var headers = { 'content-type': 'application/json' }; headers[req.headerName] = key;
        res = await fetch('https://' + req.host + req.path, { method: 'POST', headers: headers, body: JSON.stringify(req.body) });
      } catch (e) {
        if (attempt >= waits.length || stopped) { failures.network = (failures.network || 0) + 1; var ne = new Error('network'); ne.kind = 'network'; throw ne; }
        await sleep(waits[attempt]); continue;
      }
      var text = await res.text();
      if (res.ok) { var p = C.parseGeminiResponse(JSON.parse(text)); return { rawText: p.rawText }; }
      var kind = C.mapGeminiStatus(res.status, text);
      if (kind === 'auth') { var ae = new Error('The key was rejected.'); ae.kind = 'auth'; throw ae; }
      // A 429 on the free tier is usually the daily or per-minute quota; retrying in seconds only spends more of it.
      if (kind === 'server' && attempt < waits.length && !stopped) { await sleep(waits[attempt]); continue; }
      failures[kind] = (failures[kind] || 0) + 1;
      var e2 = new Error(kind); e2.kind = kind; throw e2;
    }
  }
  async function execute(listings, imageFiles) {
    var provider = $('provider').value;
    if (provider === 'gemini') {
      if (!$('ack').checked) { setMessage('Tick the notice box before the first call.'); return; }
      if (!key) { setMessage('Enter your key first.'); return; }
      if (!C.PINNED_MODEL) { setMessage('Real mode is disabled until the model is pinned.'); return; }
    }
    stopped = false; lastMock = provider === 'mock'; failures = {};
    var bytesByName = {};
    for (var i = 0; i < listings.length; i++) { var f = imageFiles[listings[i].image_filename]; bytesByName[listings[i].image_filename] = await readBytes(f); }
    try {
      results = await C.runBatch({
        listings: listings, provider: provider, concurrency: 2,
        call: function (l, p) { var b = bytesByName[l.image_filename]; return geminiCall(l, p, b, C.sniffImage(b)); },
        onProgress: function (d, t) { setMessage('Done ' + d + ' of ' + t + '.'); }
      });
      render(); setMessage('Finished ' + results.length + ' listing(s).' + (lastMock ? ' Demo mock: MOCK, NOT A MEASUREMENT.' : '') + failureText());
    } catch (e) { setMessage(e && e.kind === 'auth' ? 'The key was rejected.' : 'Run stopped: ' + (e && e.kind ? e.kind : 'error')); }
  }
  function failureText() {
    var k = Object.keys(failures);
    if (!k.length) return '';
    var s = ' Failed requests (shown as cannot_tell with confidence 0): ' + k.map(function (x) { return x + ' ' + failures[x]; }).join(', ') + '.';
    if (failures.rate_limit) s += ' Rate limit or quota reached (free tier: about 20 requests per day and 5 per minute). Wait for the daily reset or a minute, then retry.';
    if (failures.network) s += ' The request did not reach Google (network or browser block).';
    return s;
  }
  async function runSingle() {
    var f = $('sImage').files[0];
    if (!f) { setMessage('Choose an image.'); return; }
    var bytes = await readBytes(f), chk = C.checkImage(bytes);
    if (!chk.ok) { setMessage(chk.msg); return; }
    var rec = { title: $('sTitle').value, colour: $('sColour').value, item_type: $('sType').value, material: $('sMaterial').value, pattern: $('sPattern').value, pack_count: $('sPack').value, image_filename: f.name };
    Object.keys(rec).forEach(function (k) { if (rec[k] === '' && ['material', 'pattern', 'pack_count'].indexOf(k) >= 0) delete rec[k]; });
    var v = C.validateRecords([rec], [f.name]);
    if (!v.ok) { setMessage('Rejected: ' + v.errors.map(function (e) { return e.msg; }).join('; ')); return; }
    var map = {}; map[f.name] = f;
    await execute(v.listings, map);
  }
  async function runBatch() {
    var rf = $('bRecords').files[0], imgs = Array.prototype.slice.call($('bImages').files);
    if (!rf) { setMessage('Choose a records file.'); return; }
    var text = await new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result)); }; r.onerror = rej; r.readAsText(rf); });
    var recs;
    try { recs = C.parseRecords(text, /\.json$/i.test(rf.name) ? 'json' : 'csv'); } catch (e) { setMessage('Could not read the records file.'); return; }
    files = {}; imgs.forEach(function (f) { files[f.name] = f; });
    var v = C.validateRecords(recs, Object.keys(files));
    if (!v.ok) { setMessage('Rejected, nothing was sent. ' + v.errors.slice(0, 8).map(function (e) { return 'row ' + e.row + ': ' + e.msg; }).join('; ')); return; }
    for (var i = 0; i < v.listings.length; i++) {
      var b = await readBytes(files[v.listings[i].image_filename]), c = C.checkImage(b);
      if (!c.ok) { setMessage('Row ' + v.listings[i].rowNumber + ': ' + c.msg + '. Nothing was sent.'); return; }
    }
    await execute(v.listings, files);
  }
  function render() {
    var rows = C.flattenResults(results, TAU, lastMock), body = $('results').querySelector('tbody');
    body.textContent = '';
    var counts = { match: 0, mismatch: 0, cannot_tell: 0 };
    rows.forEach(function (r) {
      counts[r.effective_verdict]++;
      var tr = document.createElement('tr');
      [r.row, r.image_filename, r.attribute, r.listing_value, r.verdict, r.effective_verdict, r.confidence, r.reason, r.stamp].forEach(function (c) { var td = document.createElement('td'); td.textContent = c === null || c === undefined ? '' : C.redact(String(c), key); tr.appendChild(td); });
      body.appendChild(tr);
    });
    $('summary').textContent = 'Effective verdicts at tau ' + TAU + ': match ' + counts.match + ', mismatch ' + counts.mismatch + ', cannot tell ' + counts.cannot_tell + '.' + (lastMock ? ' MOCK, NOT A MEASUREMENT.' : '');
  }
  init();
})();