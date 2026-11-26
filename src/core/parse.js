/* Strict parsing of model output (SPEC 4.4). Classic UMD. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ListingCore = root.ListingCore || {}; for (var k in api) root.ListingCore[k] = api[k]; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var VERDICTS = ['match', 'mismatch', 'cannot_tell'];
  function cleanReason(r) {
    var s = r === null || r === undefined ? '' : String(r);
    s = s.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
    return s.length > 200 ? s.slice(0, 200) : s;
  }
  function failed(requested, flag) {
    var out = {};
    requested.forEach(function (a) { out[a] = { verdict: 'cannot_tell', confidence: 0, reason: '', flags: [flag] }; });
    return { ok: false, attributes: out };
  }
  // Returns { ok, attributes } ; ok=false means a call-level parse failure.
  function parseOutput(text, requested) {
    var s = text === null || text === undefined ? '' : String(text).trim();
    s = s.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '');
    var i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i < 0 || j < i) return failed(requested, 'parse_error');
    var obj;
    try { obj = JSON.parse(s.slice(i, j + 1)); } catch (e) { return failed(requested, 'parse_error'); }
    if (!obj || typeof obj !== 'object' || !obj.attributes || typeof obj.attributes !== 'object' || Array.isArray(obj.attributes)) return failed(requested, 'parse_error');
    var out = {};
    requested.forEach(function (a) {
      var v = Object.prototype.hasOwnProperty.call(obj.attributes, a) ? obj.attributes[a] : undefined;
      if (v === undefined || v === null || typeof v !== 'object') { out[a] = { verdict: 'cannot_tell', confidence: 0, reason: '', flags: ['missing'] }; return; }
      var verdict = typeof v.verdict === 'string' ? v.verdict.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
      var conf = v.confidence;
      if (VERDICTS.indexOf(verdict) < 0 || typeof conf !== 'number' || !isFinite(conf) || conf < 0 || conf > 1) {
        out[a] = { verdict: 'cannot_tell', confidence: 0, reason: cleanReason(v.reason), flags: ['parse_error'] };
        return;
      }
      out[a] = { verdict: verdict, confidence: conf, reason: cleanReason(v.reason), flags: [] };
    });
    return { ok: true, attributes: out };
  }
  return { parseOutput: parseOutput, failedAttributes: failed, VERDICTS: VERDICTS };
});