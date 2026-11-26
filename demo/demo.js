/* Results page. Renders only what pilot.js and results.js contain, with textContent only. No network. */
(function () {
  'use strict';
  var P = window.LISTING_PILOT, R = window.LISTING_RESULTS;
  var root = document.getElementById('root'), banner = document.getElementById('banner');
  function el(tag, text, cls) { var e = document.createElement(tag); if (text !== undefined && text !== null) e.textContent = String(text); if (cls) e.className = cls; return e; }
  function table(head, rows) {
    var t = el('table'), tr = el('tr');
    head.forEach(function (h) { tr.appendChild(el('th', h)); });
    t.appendChild(tr);
    rows.forEach(function (r) { var row = el('tr'); r.forEach(function (c) { row.appendChild(el('td', c)); }); t.appendChild(row); });
    return t;
  }
  function section(title, parent) { var s = el('section'); s.appendChild(el('h2', title)); (parent || root).appendChild(s); return s; }
  if (!P) { banner.textContent = 'No pilot results loaded. pilot.js did not load.'; }
  else {
    banner.textContent = P.stamp;
    banner.className = 'banner pilot';
    var head = ['attribute', 'TP', 'FP', 'FN', 'TN', 'recall: planted mismatches caught', 'precision: flags that were planted', 'false flags on unchanged attributes', 'cannot_tell rate'];
    var s0 = section('What this is');
    s0.appendChild(el('p', 'A pilot of the method on the practice (development) listings only: ' + P.sizes.planted + ' planted listings and ' + P.sizes.natural + ' natural listings from the Amazon Berkeley Objects sample. The verdicts below are real answers from ' + P.run.model + ' (' + P.run.modelNote + '), at confidence threshold tau ' + P.run.tau + '. The held-out listings used for the pre-registered evaluation have not been run or opened for this page, and no evaluation verdict is given here.'));
    s0.appendChild(el('p', 'Every proportion is shown as count/total with its 95% Wilson interval. With samples this small the intervals are wide: read them, not the point values.', 'note'));
    var s1 = section('Planted test (pilot)');
    s1.appendChild(el('p', 'Real listings where one text attribute was swapped, so the right answer is known. "Unchanged attributes" are assumed correct.', 'note'));
    s1.appendChild(table(head, P.planted.rows));
    var s2 = section('Colour baseline on the same listings');
    s2.appendChild(el('p', 'A cheap non-AI check: it decodes the photo, finds the dominant colour families and compares them with the listed colour. Settings (foreground ' + P.baselineParams.fg + ', share ' + P.baselineParams.share + ') were tuned on the full planted development set, which includes these listings, so it has a head start here.', 'note'));
    s2.appendChild(table(head, P.planted.baselineRows));
    var c = P.planted.colour;
    s2.appendChild(table(['colour, same ' + P.sizes.plantedColourPairs + ' listings', 'TP / FP / FN / TN', 'recall', 'precision', 'false flags'], [
      ['Gemini', [c.vlm.tp, c.vlm.fp, c.vlm.fn, c.vlm.tn].join(' / '), c.vlm.recall, c.vlm.precision, c.vlm.falseFlag],
      ['Colour baseline', [c.baseline.tp, c.baseline.fp, c.baseline.fn, c.baseline.tn].join(' / '), c.baseline.recall, c.baseline.precision, c.baseline.falseFlag]
    ]));
    s2.appendChild(el('p', 'On this subset the two give the same colour counts. The pilot cannot separate them; the model also covers item type and material, which the colour baseline does not.'));
    var s3 = section('Natural listings (pilot, owner labels)');
    s3.appendChild(el('p', 'Real listings, labelled by the owner with no model output visible. Counts are listing-attribute pairs; agreement means the model verdict equals the owner verdict.', 'note'));
    s3.appendChild(table(['attribute', 'pairs', 'owner mismatches', 'model mismatch flags', 'agreement with owner', 'model cannot_tell rate'], P.natural.rows));
    s3.appendChild(el('p', 'Colour baseline agreement with the owner on colour: ' + P.natural.colourBaselineAgreement + '. With 7 listings and 1 owner mismatch, no mismatch rate is reported.'));
    var s4 = section('Examples with the real Gemini verdicts');
    s4.appendChild(el('p', 'All pilot listings, image next to listing text. "Truth" is the planted change (planted set) or the owner label (natural set).', 'note'));
    P.examples.forEach(function (x) {
      var d = el('div', null, 'ex');
      var img = el('img'); img.src = x.image; img.alt = 'Product photo for listing ' + x.id; img.width = 140; img.className = 'thumb';
      d.appendChild(img);
      var body = el('div', null, 'exbody');
      body.appendChild(el('div', x.title, 'ttl'));
      body.appendChild(el('div', x.set + ' / ' + x.category + (x.planted ? ' / planted change ' + x.planted : ''), 'note'));
      body.appendChild(table(['attribute', 'listed', 'Gemini', 'confidence', 'truth', 'colour baseline', 'reason'], x.attributes.map(function (a) {
        return [a.attribute, a.listed, a.effective + (a.effective !== a.verdict ? ' (raw ' + a.verdict + ')' : ''), a.confidence, a.truth, a.colourBaseline === null ? '' : a.colourBaseline, a.reason];
      })));
      d.appendChild(body);
      s4.appendChild(d);
    });
    var s5 = section('Small-n limits');
    var ul = el('ul'); P.limits.forEach(function (t) { ul.appendChild(el('li', t)); }); s5.appendChild(ul);
    s5.appendChild(el('p', P.citation, 'note'));
  }
  if (R) {
    var det = el('details'); det.appendChild(el('summary', 'Pipeline self-test on synthetic fixtures (' + R.stamp + ')'));
    root.appendChild(det);
    var mb = el('div', R.banner, 'banner'); det.appendChild(mb);
    var mh = ['attribute', 'TP', 'FP', 'FN', 'TN', 'precision', 'recall', 'F1', 'cannot_tell rate'];
    var m1 = section('Planted test (MOCK)', det);
    m1.appendChild(R.plantedTable.length ? table(mh, R.plantedTable) : el('p', 'Not run.'));
    var m3 = section('Baseline vs mock model (MOCK)', det);
    R.baselineTable.forEach(function (b) { m3.appendChild(el('h3', b.checker)); m3.appendChild(table(mh, b.rows)); });
    var m6 = section('Mock examples (MOCK, NOT A MEASUREMENT)', det);
    R.examples.forEach(function (x) {
      var d = el('div', null, 'ex');
      d.appendChild(el('div', x.title));
      d.appendChild(el('div', 'Attribute ' + x.attribute + ' = ' + (x.attributes[x.attribute] === undefined ? '' : x.attributes[x.attribute]) + ' -> ' + x.verdict + ' (confidence ' + x.confidence + ')'));
      d.appendChild(el('div', 'Reason: ' + x.reason, 'note'));
      d.appendChild(el('span', R.stamp, 'stamp'));
      m6.appendChild(d);
    });
  }
  var s7 = section('Honesty');
  var ul2 = el('ul');
  ['Built with AI coding agents; Anirudh wrote the spec, gates and reviews.', 'Design reviews were run by AI review agents; the owner decided which findings to accept.', 'There are no users, no production deployment and no adoption.', 'Pilot results are not the evaluation and are never described as it.'].forEach(function (t) { ul2.appendChild(el('li', t)); });
  s7.appendChild(ul2);
})();
