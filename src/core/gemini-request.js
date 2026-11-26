/* Gemini generateContent request construction and response parsing, shared by the CLI and the Live page. Classic UMD. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ListingCore = root.ListingCore || {}; for (var k in api) root.ListingCore[k] = api[k]; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var HOST = 'generativelanguage.googleapis.com';
  function mapStatus(status, bodyText) {
    var t = String(bodyText || '');
    if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(t)) return 'auth';
    if (status === 401 || status === 403) return 'auth';
    if (status === 429) return 'rate_limit';
    if (status >= 500) return 'server';
    if (status >= 400) return 'bad_request';
    return 'server';
  }
  // opts: {model, system, userText, imageBase64, mime, maxOutputTokens, thinkingBudget}
  function buildRequest(o) {
    var gen = { temperature: 0, maxOutputTokens: o.maxOutputTokens || 600, responseMimeType: 'application/json' };
    if (typeof o.thinkingBudget === 'number') gen.thinkingConfig = { thinkingBudget: o.thinkingBudget };
    return {
      host: HOST,
      path: '/v1beta/models/' + encodeURIComponent(o.model) + ':generateContent',
      headerName: 'x-goog-api-key',
      body: {
        systemInstruction: { parts: [{ text: o.system }] },
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: o.mime, data: o.imageBase64 } }, { text: o.userText }] }],
        generationConfig: gen
      }
    };
  }
  // Returns {rawText, usage, finishReason, truncated} or throws {kind, status} for blocked responses.
  function parseResponse(json) {
    var fail = function (kind) { var e = new Error('provider ' + kind); e.kind = kind; e.status = 200; return e; };
    if (!json || typeof json !== 'object') throw fail('server');
    if (json.promptFeedback && json.promptFeedback.blockReason) throw fail('blocked');
    var c = json.candidates && json.candidates[0];
    if (!c) throw fail('blocked');
    var fr = c.finishReason || null;
    if (fr && fr !== 'STOP' && fr !== 'MAX_TOKENS') throw fail('blocked'); // SAFETY, RECITATION, OTHER, BLOCKLIST, ...
    var parts = (c.content && c.content.parts) || [];
    var text = parts.filter(function (p) { return p && typeof p.text === 'string' && !p.thought; }).map(function (p) { return p.text; }).join('');
    var u = json.usageMetadata || {};
    // Thinking tokens are billed as output; count them.
    var out = (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0);
    return { rawText: text, usage: { inputTokens: u.promptTokenCount || 0, outputTokens: out }, finishReason: fr, truncated: fr === 'MAX_TOKENS' };
  }
  return { buildGeminiRequest: buildRequest, parseGeminiResponse: parseResponse, mapGeminiStatus: mapStatus, GEMINI_HOST: HOST };
});