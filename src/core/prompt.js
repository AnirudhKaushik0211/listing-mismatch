/* Prompt building. Classic UMD (Node require and browser window.ListingCore). */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(isNode ? Object.assign({}, require('./sha256.js'), require('./template.generated.js')) : root.ListingCore || {});
  if (isNode) module.exports = api;
  else { root.ListingCore = root.ListingCore || {}; for (var k in api) root.ListingCore[k] = api[k]; }
})(typeof window !== 'undefined' ? window : globalThis, function (L) {
  var PROMPT_ID = 'check-v1';
  var ATTRS = ['colour', 'item_type', 'material', 'pattern', 'pack_count'];
  var SEP = '\n---USER---\n';
  function normalise(s) { return String(s).replace(/\r\n/g, '\n').replace(/^\uFEFF/, ''); }
  // JSON-escape and neutralise characters that could close the delimited block.
  function esc(v) {
    return JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  }
  function split() {
    var t = normalise(L.TEMPLATE);
    var i = t.indexOf(SEP);
    if (i < 0) throw new Error('prompt template has no separator');
    return { system: t.slice(0, i).trim(), user: t.slice(i + SEP.length) };
  }
  function promptHash() { return L.sha256(normalise(L.TEMPLATE)); }
  function requestedAttributes(listing) {
    var a = (listing && listing.attributes) || {};
    return ATTRS.filter(function (k) { return a[k] !== null && a[k] !== undefined && a[k] !== ''; });
  }
  function build(listing) {
    var parts = split();
    var req = requestedAttributes(listing);
    var obj = {};
    req.forEach(function (k) { obj[k] = listing.attributes[k]; });
    var userText = parts.user.replace('{{TITLE}}', function () { return esc(String(listing.title)); }).replace('{{ATTRIBUTES_JSON}}', function () { return esc(obj); });
    return { system: parts.system, userText: userText, requested: req, promptHash: promptHash(), promptId: PROMPT_ID };
  }
  return { PROMPT_ID: PROMPT_ID, ATTRS: ATTRS, buildPrompt: build, promptHash: promptHash, requestedAttributes: requestedAttributes, escapeForPrompt: esc };
});