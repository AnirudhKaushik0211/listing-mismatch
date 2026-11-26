/* Live page logic that needs no DOM (so tests can load it). Single tau constant for the Live page. */
(function (root) {
  'use strict';
  // Same value as eval/freeze.json stages.method.tau (checked by a test). Used for Gemini and mock.
  var TAU = 0.9;
  var TAU_LABEL = 'tau 0.9 (same as the evaluated method)';
  var MOCK_BANNER = 'Demo mock selected: no model was called. Choose Gemini to run a real check.';
  // Entering a key switches to Gemini unless the user explicitly chose mock afterwards.
  function providerAfterKeyInput(current, key, userChoseMock, geminiAvailable) {
    if (key && !userChoseMock && geminiAvailable) return 'gemini';
    return current;
  }
  function errorInfo(status) {
    var s = Number(status);
    if (s === 500 || s === 503) return { status: s, message: "Google's model is overloaded or unavailable right now; try again in a few minutes. No verdict was produced." };
    if (s === 429) return { status: s, message: 'Free-tier limit reached (about 20 requests per day, 5 per minute); try after the daily reset.' };
    if (s === 400 || s === 403) return { status: s, message: 'Key or request rejected; check the key.' };
    if (s >= 500) return { status: s, message: "Google's model is overloaded or unavailable right now; try again in a few minutes. No verdict was produced." };
    if (s >= 400) return { status: s, message: 'Key or request rejected; check the key.' };
    return { status: 0, message: 'The request did not reach Google (network or browser block). No verdict was produced.' };
  }
  function statusText(failure) { return failure ? 'failed ' + (failure.status ? 'HTTP ' + failure.status : 'network') : 'ok'; }
  // Failed listings are excluded from the verdict counts and reported separately.
  function summarize(results, rows) {
    var counts = { match: 0, mismatch: 0, cannot_tell: 0, failed: 0 };
    results.forEach(function (r) { if (r.failure) counts.failed++; });
    rows.forEach(function (r) { if (r.status === 'ok') counts[r.effective_verdict]++; });
    return counts;
  }
  // One row per attribute for ok listings; one error row per failed listing.
  function buildRows(C, results, tau, isMock) {
    var ok = results.filter(function (r) { return !r.failure; });
    var okRows = C.flattenResults(ok, tau, isMock).map(function (r) { r.status = 'ok'; return r; });
    var out = [];
    results.forEach(function (res) {
      if (res.failure) {
        out.push({ row: res.rowNumber, image_filename: res.image_filename, title: res.title, attribute: '(all)', listing_value: '', verdict: 'error', effective_verdict: 'error', confidence: '', reason: res.failure.message, stamp: '', status: statusText(res.failure) });
      } else {
        okRows.filter(function (r) { return r.row === res.rowNumber; }).forEach(function (r) { out.push(r); });
      }
    });
    return out;
  }
  var COLS = ['row', 'image_filename', 'title', 'attribute', 'listing_value', 'verdict', 'effective_verdict', 'confidence', 'reason', 'stamp', 'status'];
  function toCsv(C, rows) {
    return [COLS.map(C.neutraliseCell).join(',')].concat(rows.map(function (r) { return COLS.map(function (c) { return C.neutraliseCell(r[c]); }).join(','); })).join('\r\n') + '\r\n';
  }
  var api = { TAU: TAU, TAU_LABEL: TAU_LABEL, MOCK_BANNER: MOCK_BANNER, providerAfterKeyInput: providerAfterKeyInput, errorInfo: errorInfo, statusText: statusText, summarize: summarize, buildRows: buildRows, toCsv: toCsv, CSV_COLS: COLS };
  root.LiveLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
