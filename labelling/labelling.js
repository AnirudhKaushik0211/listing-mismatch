/* Labelling page logic. Classic script; pure functions are exported for Node tests (typeof module). No network. */
(function (root) {
  'use strict';
  var SCHEMA = 'listing-mismatch-labels/v1';
  var VERDICTS = ['match', 'mismatch', 'cannot_tell'];
  var ATTRS = ['colour', 'item_type', 'material', 'pattern', 'pack_count'];
  var TAGS = ['shade_ambiguity', 'different_variant_shown', 'wrong_item_type', 'count_mismatch', 'material_not_as_described', 'pattern_mismatch', 'attribute_text_wrong_other', 'photo_not_the_product', 'other'];
  var NOTE_MAX = 200;

  function taskAttrs(task) { return ATTRS.filter(function (a) { return task.attributes[a] !== null && task.attributes[a] !== undefined && task.attributes[a] !== ''; }); }
  function isComplete(task, entry) {
    if (!entry) return false;
    return taskAttrs(task).every(function (a) { return entry[a] && VERDICTS.indexOf(entry[a].verdict) >= 0; });
  }
  function progress(tasks, split, state) {
    var list = tasks.splits[split] || [], done = 0;
    list.forEach(function (t) { if (isComplete(t, state[t.id])) done++; });
    return { done: done, total: list.length };
  }
  function setVerdict(state, id, attr, verdict) {
    if (VERDICTS.indexOf(verdict) < 0) throw new Error('bad verdict');
    var e = state[id] || (state[id] = {});
    var cur = e[attr] || { verdict: null, tag: null, note: '' };
    cur.verdict = verdict;
    if (verdict !== 'mismatch') cur.tag = null;
    e[attr] = cur;
    return state;
  }
  function setTag(state, id, attr, tag) {
    if (tag !== null && TAGS.indexOf(tag) < 0) throw new Error('bad tag');
    var cur = state[id] && state[id][attr];
    if (!cur || cur.verdict !== 'mismatch') throw new Error('a tag needs a mismatch verdict');
    cur.tag = tag;
    return state;
  }
  function setNote(state, id, attr, note) {
    var cur = state[id] && state[id][attr];
    if (!cur) throw new Error('no label yet');
    cur.note = String(note || '').slice(0, NOTE_MAX);
    return state;
  }
  // Builds the downloadable label file (only complete listings are included).
  function buildLabelFile(tasks, split, state, now) {
    var labels = [];
    (tasks.splits[split] || []).forEach(function (t) {
      if (!isComplete(t, state[t.id])) return;
      var attrs = {};
      taskAttrs(t).forEach(function (a) { var e = state[t.id][a]; attrs[a] = { verdict: e.verdict, tag: e.verdict === 'mismatch' ? (e.tag || null) : null, note: String(e.note || '').slice(0, NOTE_MAX) }; });
      labels.push({ id: t.id, attributes: attrs });
    });
    return { schema: SCHEMA, split: split, tasksHash: tasks.tasksHash, labeller: 'owner', synthetic: false, createdAt: (now || new Date()).toISOString(), labels: labels };
  }
  // Validates a label file against the loaded tasks. Returns {ok, error, state, ignored}.
  function validateLabelFile(obj, tasks, split) {
    var fail = function (m) { return { ok: false, error: m, state: {}, ignored: 0 }; };
    if (!obj || typeof obj !== 'object') return fail('not a JSON object');
    if (obj.schema !== SCHEMA) return fail('wrong schema');
    if (obj.tasksHash !== tasks.tasksHash) return fail('tasksHash does not match the loaded tasks; nothing was loaded');
    if (obj.labeller !== 'owner') return fail('labeller must be owner');
    if (obj.synthetic !== false) return fail('synthetic must be false');
    var sp = split || obj.split;
    if (obj.split !== sp || !tasks.splits[sp]) return fail('unknown split');
    if (!Array.isArray(obj.labels)) return fail('labels must be an array');
    var byId = {};
    tasks.splits[sp].forEach(function (t) { byId[t.id] = t; });
    var state = {}, ignored = 0;
    for (var i = 0; i < obj.labels.length; i++) {
      var l = obj.labels[i];
      if (!l || typeof l.id !== 'string' || !l.attributes || typeof l.attributes !== 'object') return fail('malformed label entry');
      var t = byId[l.id];
      if (!t) { ignored++; continue; }
      var keys = Object.keys(l.attributes);
      for (var k = 0; k < keys.length; k++) {
        var a = keys[k], e = l.attributes[a];
        if (taskAttrs(t).indexOf(a) < 0) return fail('attribute not in task: ' + a);
        if (!e || VERDICTS.indexOf(e.verdict) < 0) return fail('verdict outside the allowed set');
        if (e.tag !== null && e.tag !== undefined && (TAGS.indexOf(e.tag) < 0 || e.verdict !== 'mismatch')) return fail('tag not allowed here');
        if (e.note !== undefined && e.note !== null && (typeof e.note !== 'string' || e.note.length > NOTE_MAX)) return fail('note too long');
      }
      state[l.id] = {};
      keys.forEach(function (a2) { var e2 = l.attributes[a2]; state[l.id][a2] = { verdict: e2.verdict, tag: e2.tag || null, note: e2.note || '' }; });
    }
    return { ok: true, error: null, state: state, ignored: ignored };
  }
  var api = { SCHEMA: SCHEMA, VERDICTS: VERDICTS, ATTRS: ATTRS, TAGS: TAGS, taskAttrs: taskAttrs, isComplete: isComplete, progress: progress, setVerdict: setVerdict, setTag: setTag, setNote: setNote, buildLabelFile: buildLabelFile, validateLabelFile: validateLabelFile };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.ListingLabelling = api;

  // ---- UI (browser only) ----
  if (typeof document === 'undefined') return;
  var tasks = root.LISTING_TASKS;
  var el = function (id) { return document.getElementById(id); };
  var KEY = function () { return 'listingMismatchLabels:v1:' + tasks.tasksHash; };
  var state = {}, split = null, idx = 0, focusAttr = 0;
  function save() { try { root.localStorage.setItem(KEY(), JSON.stringify(state)); } catch (e) { /* storage unavailable */ } }
  function loadSaved() { try { var s = root.localStorage.getItem(KEY()); if (s) state = JSON.parse(s) || {}; } catch (e) { state = {}; } }
  function order() { return tasks.order[split]; }
  function current() { var id = order()[idx]; return tasks.splits[split].filter(function (t) { return t.id === id; })[0]; }
  function msg(t) { el('message').textContent = t || ''; }
  function render() {
    var t = current();
    var p = progress(tasks, split, state);
    el('progress').textContent = p.done + ' / ' + p.total + ' complete; listing ' + (idx + 1) + ' of ' + p.total;
    if (!t) { el('card').hidden = true; return; }
    el('card').hidden = false;
    el('image').src = '../data/' + t.image;
    el('title').textContent = t.title;
    var box = el('attrs'); box.textContent = '';
    taskAttrs(t).forEach(function (a, i) {
      var row = document.createElement('div'); row.className = 'attr' + (i === focusAttr ? ' focus' : '');
      var name = document.createElement('span'); name.className = 'name'; name.textContent = a + ': ' + t.attributes[a]; row.appendChild(name);
      var cur = state[t.id] && state[t.id][a];
      VERDICTS.forEach(function (v, vi) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = (vi + 1) + ' ' + v.replace('_', ' ');
        if (cur && cur.verdict === v) b.className = 'on ' + v;
        b.addEventListener('click', function () { focusAttr = i; setVerdict(state, t.id, a, v); save(); render(); });
        row.appendChild(b);
      });
      if (cur && cur.verdict === 'mismatch') {
        var sel = document.createElement('select'); var o0 = document.createElement('option'); o0.value = ''; o0.textContent = '(tag, optional)'; sel.appendChild(o0);
        TAGS.forEach(function (tg) { var o = document.createElement('option'); o.value = tg; o.textContent = tg; if (cur.tag === tg) o.selected = true; sel.appendChild(o); });
        sel.addEventListener('change', function () { setTag(state, t.id, a, sel.value || null); save(); });
        row.appendChild(sel);
        var note = document.createElement('input'); note.type = 'text'; note.maxLength = NOTE_MAX; note.placeholder = 'note (optional)'; note.value = cur.note || '';
        note.addEventListener('input', function () { setNote(state, t.id, a, note.value); save(); });
        row.appendChild(note);
      }
      box.appendChild(row);
    });
  }
  function move(d) { var n = order().length; idx = Math.max(0, Math.min(n - 1, idx + d)); focusAttr = 0; render(); }
  function download() {
    var f = buildLabelFile(tasks, split, state, new Date());
    var blob = new Blob([JSON.stringify(f, null, 1)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'labels-' + split + '-' + f.labels.length + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    msg('Downloaded ' + f.labels.length + ' complete listings. Save the file as data/labels/' + split + '.labels.json.');
  }
  function loadFile(file) {
    var r = new FileReader();
    r.onload = function () {
      var obj; try { obj = JSON.parse(String(r.result)); } catch (e) { msg('Not valid JSON. Nothing was loaded.'); return; }
      var v = validateLabelFile(obj, tasks, split);
      if (!v.ok) { msg('Cannot load: ' + v.error); return; }
      Object.keys(v.state).forEach(function (id) { state[id] = v.state[id]; });
      save(); render(); msg('Loaded ' + Object.keys(v.state).length + ' listings' + (v.ignored ? '; ignored ' + v.ignored + ' unknown ids' : '') + '.');
    };
    r.readAsText(file);
  }
  function init() {
    if (!tasks) { msg('tasks.js did not load. Run scripts/build-labelling.cjs first.'); return; }
    loadSaved();
    var sel = el('split');
    Object.keys(tasks.splits).forEach(function (s) { var o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o); });
    split = sel.value; idx = 0;
    sel.addEventListener('change', function () { split = sel.value; idx = 0; focusAttr = 0; render(); });
    el('prev').addEventListener('click', function () { move(-1); });
    el('next').addEventListener('click', function () { move(1); });
    el('download').addEventListener('click', download);
    el('load').addEventListener('change', function (e) { if (e.target.files[0]) loadFile(e.target.files[0]); });
    document.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      var t = current(); if (!t) return;
      var attrs = taskAttrs(t);
      if (e.key >= '1' && e.key <= '3') { setVerdict(state, t.id, attrs[focusAttr], VERDICTS[Number(e.key) - 1]); save(); if (focusAttr < attrs.length - 1) focusAttr++; render(); }
      else if (e.key === 'Enter' || e.key === 'ArrowRight') move(1);
      else if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowDown') { focusAttr = Math.min(attrs.length - 1, focusAttr + 1); render(); }
      else if (e.key === 'ArrowUp') { focusAttr = Math.max(0, focusAttr - 1); render(); }
    });
    render();
  }
  init();
})(typeof window !== 'undefined' ? window : globalThis);