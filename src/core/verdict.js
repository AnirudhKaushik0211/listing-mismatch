/* Effective verdict at tau and per-listing summary counts. Classic UMD. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ListingCore = root.ListingCore || {}; for (var k in api) root.ListingCore[k] = api[k]; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // a: {verdict, confidence, reason, flags}. Returns a new object with the effective verdict.
  function effective(a, tau) {
    var flags = (a.flags || []).slice();
    var verdict = a.verdict;
    if (verdict === 'mismatch' && !(a.confidence >= tau)) {
      verdict = 'cannot_tell';
      flags.push('low_confidence_mismatch');
    }
    return { verdict: verdict, confidence: a.confidence, reason: a.reason, flags: flags };
  }
  function summarise(attributes, tau) {
    var counts = { match: 0, mismatch: 0, cannot_tell: 0 };
    Object.keys(attributes).forEach(function (k) { counts[effective(attributes[k], tau).verdict]++; });
    return counts;
  }
  return { effective: effective, summarise: summarise };
});