/* Live page logic that does not touch the DOM: validation, CSV/JSON, export, redaction, demo mock, batch runner. Classic UMD. */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(isNode ? Object.assign({}, require('./sha256.js'), require('./prompt.js'), require('./parse.js'), require('./verdict.js'), require('./gemini-request.js')) : root.ListingCore || {});
  if (isNode) module.exports = api;
  else { root.ListingCore = root.ListingCore || {}; for (var k in api) root.ListingCore[k] = api[k]; }
})(typeof window !== 'undefined' ? window : globalThis, function (L) {
  var CAP = 25, MAX_IMAGE = 4 * 1024 * 1024;
  var STAMP = 'MOCK, NOT A MEASUREMENT';
  var REQUIRED = ['title', 'colour', 'item_type', 'image_filename'];
  var OPTIONAL = ['material', 'pattern', 'pack_count'];
  function sniffImage(b) {
    if (!b || b.length < 12) return null;
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    return null;
  }
  function checkImage(bytes) {
    if (!bytes) return { ok: false, msg: 'image missing' };
    if (bytes.length > MAX_IMAGE) return { ok: false, msg: 'image larger than 4 MB' };
    var m = sniffImage(bytes);
    return m ? { ok: true, mime: m } : { ok: false, msg: 'image is not JPEG, PNG or WebP' };
  }
  function parseCsv(text) {
    var rows = [], row = [], cell = '', q = false, i = 0, s = String(text).replace(/^\uFEFF/, '');
    for (; i < s.length; i++) {
      var c = s[i];
      if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return h.trim(); });
    return rows.slice(1).map(function (r) { var o = {}; head.forEach(function (h, j) { o[h] = r[j] === undefined ? '' : r[j]; }); return o; });
  }
  function parseRecords(text, kind) {
    if (kind === 'json') {
      var v = JSON.parse(text);
      if (!Array.isArray(v)) throw new Error('JSON must be an array of records');
      return v;
    }
    return parseCsv(text);
  }
  // Returns {ok, errors:[{row,msg}], listings:[{rowNumber,title,attributes,image_filename}]}
  function validateRecords(records, availableFiles) {
    var errors = [], listings = [];
    if (!Array.isArray(records)) return { ok: false, errors: [{ row: 0, msg: 'records must be an array' }], listings: [] };
    if (records.length > CAP) return { ok: false, errors: [{ row: 0, msg: 'batch cap is ' + CAP + ' items; this file has ' + records.length + '. Nothing was sent.' }], listings: [] };
    if (!records.length) return { ok: false, errors: [{ row: 0, msg: 'no records' }], listings: [] };
    var allowed = REQUIRED.concat(OPTIONAL);
    var files = availableFiles || [];
    records.forEach(function (r, idx) {
      var row = idx + 1, bad = false;
      function err(m) { errors.push({ row: row, msg: m }); bad = true; }
      if (!r || typeof r !== 'object' || Array.isArray(r)) return err('row is not an object');
      Object.keys(r).forEach(function (k) { if (allowed.indexOf(k) < 0) err('unknown column: ' + String(k).slice(0, 40)); });
      REQUIRED.forEach(function (k) { if (r[k] === undefined || r[k] === null || String(r[k]).trim() === '') err('missing ' + k); });
      if (r.title && String(r.title).length > 250) err('title longer than 250 characters');
      ['colour', 'item_type', 'material', 'pattern', 'image_filename'].forEach(function (k) { if (r[k] && String(r[k]).length > 80) err(k + ' longer than 80 characters'); });
      var pc = null;
      if (r.pack_count !== undefined && r.pack_count !== null && String(r.pack_count).trim() !== '') {
        var n = Number(r.pack_count);
        if (!Number.isInteger(n) || n < 1 || n > 100) err('pack_count must be an integer from 1 to 100'); else pc = n;
      }
      if (r.image_filename && files.indexOf(String(r.image_filename)) < 0) err('image file not selected: ' + String(r.image_filename).slice(0, 80));
      if (bad) return;
      var clean = function (v) { return v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim(); };
      listings.push({ rowNumber: row, title: String(r.title).trim(), image_filename: String(r.image_filename), attributes: { colour: clean(r.colour), item_type: clean(r.item_type), material: clean(r.material), pattern: clean(r.pattern), pack_count: pc } });
    });
    return { ok: errors.length === 0, errors: errors, listings: errors.length ? [] : listings };
  }
  function redact(text, key) {
    var s = String(text === undefined || text === null ? '' : text);
    if (key && String(key).length >= 4) s = s.split(String(key)).join('[redacted]');
    return s.replace(/AIza[0-9A-Za-z_\-]{35}/g, '[redacted]');
  }
  function demoMock(filename, attribute) {
    var h = L.sha256(String(filename) + '|' + attribute);
    var n = parseInt(h.slice(0, 8), 16) % 3;
    return { verdict: ['match', 'mismatch', 'cannot_tell'][n], confidence: 0.5, reason: 'demo mock, no model called', flags: [], mock: true };
  }
  function neutralise(v) {
    var s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  var COLS = ['row', 'image_filename', 'title', 'attribute', 'listing_value', 'verdict', 'effective_verdict', 'confidence', 'reason', 'stamp'];
  function toCsv(rows) {
    return [COLS.map(neutralise).join(',')].concat(rows.map(function (r) { return COLS.map(function (c) { return neutralise(r[c]); }).join(','); })).join('\r\n') + '\r\n';
  }
  function flatten(results, tau, isMock) {
    var out = [];
    results.forEach(function (res) {
      Object.keys(res.attributes).forEach(function (a) {
        var v = res.attributes[a], e = L.effective(v, tau);
        out.push({ row: res.rowNumber, image_filename: res.image_filename, title: res.title, attribute: a, listing_value: res.listing_attributes ? res.listing_attributes[a] : '', verdict: v.verdict, effective_verdict: e.verdict, confidence: v.confidence, reason: v.reason, stamp: isMock ? STAMP : '' });
      });
    });
    return out;
  }
  // call(listing, prompt) -> Promise<{rawText}|throws {kind}>. Mock path needs no call.
  async function runBatch(opts) {
    var listings = opts.listings, results = new Array(listings.length), next = 0, stopped = false;
    var conc = Math.min(opts.concurrency || 2, 2);
    async function one(i) {
      var l = listings[i], p = L.buildPrompt({ title: l.title, attributes: l.attributes });
      var base = { rowNumber: l.rowNumber, image_filename: l.image_filename, title: l.title, listing_attributes: l.attributes };
      if (opts.provider === 'mock') {
        var at = {}; p.requested.forEach(function (a) { at[a] = L.demoMock(l.image_filename, a); });
        results[i] = Object.assign(base, { attributes: at }); return;
      }
      var parsed = null;
      for (var attempt = 0; attempt < 2 && !(parsed && parsed.ok); attempt++) {
        var r = await opts.call(l, p);
        parsed = L.parseOutput(r.rawText, p.requested);
      }
      results[i] = Object.assign(base, { attributes: parsed.attributes });
    }
    async function worker() {
      while (!stopped) {
        var i = next++;
        if (i >= listings.length) return;
        try { await one(i); } catch (e) {
          if (e && e.kind === 'auth') { stopped = true; throw e; }
          var p = L.buildPrompt({ title: listings[i].title, attributes: listings[i].attributes });
          results[i] = { rowNumber: listings[i].rowNumber, image_filename: listings[i].image_filename, title: listings[i].title, listing_attributes: listings[i].attributes, attributes: L.failedAttributes(p.requested, 'provider_error').attributes };
        }
        if (opts.onProgress) opts.onProgress(i + 1, listings.length);
      }
    }
    var ws = []; for (var w = 0; w < conc; w++) ws.push(worker());
    await Promise.all(ws);
    return results.filter(Boolean);
  }
  return { LIVE_CAP: CAP, LIVE_MAX_IMAGE: MAX_IMAGE, MOCK_STAMP: STAMP, sniffImage: sniffImage, checkImage: checkImage, parseCsv: parseCsv, parseRecords: parseRecords, validateRecords: validateRecords, redact: redact, demoMock: demoMock, neutraliseCell: neutralise, toCsv: toCsv, flattenResults: flatten, runBatch: runBatch };
});