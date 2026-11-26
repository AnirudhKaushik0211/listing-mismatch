'use strict';
// Deny-list, secret, banned-phrase and honesty-sentence scan. Prints path:line:rule only, never the matched text.
const fs = require('fs');
const path = require('path');
const R = require('../src/denylist-rules.cjs');
const { knownValues } = require('../src/secrets.cjs');
const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'images', '.agents']);
const BIN = /\.(jpg|jpeg|png|gif|webp|gz|tar|zip|ico|pdf)$/i;
function walk(root, rel, out, opts) {
  const dir = path.join(root, rel);
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (r === 'data' || r.startsWith('data/')) continue;
      walk(root, r, out, opts);
    } else if (!BIN.test(e.name) && e.name !== '.denylist.local' && !(opts.skip && opts.skip.includes(r))) out.push(r);
  }
}
function stripAllowed(line) { let s = line; for (const a of R.ALLOW_SENTENCES) s = s.split(a).join(''); return s; }
// opts: { localTerms: string[]|null, requireHonesty: bool, extraPaths: string[], skip: string[] }
function scan(root, opts = {}) {
  const findings = [];
  const files = [];
  if (opts.extraPaths && opts.extraPaths.length) files.push(...opts.extraPaths);
  else walk(root, '', files, opts);
  const secrets = knownValues();
  const terms = (opts.localTerms || []).map((t) => t.toLowerCase());
  for (const rel of files) {
    let text;
    try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { continue; }
    const lines = text.split(/\r?\n/);
    const publishable = R.PUBLISHABLE.includes(rel) || R.PUBLISHABLE_DIRS.some((d) => rel.startsWith(d));
    const isRule = rel === 'src/denylist-rules.cjs' || rel === 'scripts/denylist.cjs' || rel.startsWith('test/');
    lines.forEach((line, i) => {
      const hit = (rule) => findings.push({ path: rel, line: i + 1, rule });
      if (!isRule) {
        for (const [name, re] of R.KEY_RULES) if (re.test(line)) hit(name);
        for (const [name, re] of R.PATH_RULES) if (re.test(line)) hit(name);
      }
      for (const v of secrets) if (line.includes(v)) hit('env-secret-value');
      const low = line.toLowerCase();
      for (const t of terms) if (t && low.includes(t)) hit('owner-private-term');
      if (publishable) {
        const s = stripAllowed(line);
        for (const ph of R.BANNED_PHRASES) if (new RegExp('\\b' + ph + '\\b', 'i').test(s)) hit('banned-phrase');
        if (R.BANNED_CAUSAL.test(s)) hit('banned-causal-claim');
      }
    });
  }
  // Exact secret values also searched in eval/cache and eval/results-private (they are scanned by walk unless skipped).
  const need = (file, sentence, rule) => { const p = path.join(root, file); if (fs.existsSync(p) && !fs.readFileSync(p, 'utf8').includes(sentence)) findings.push({ path: file, line: 0, rule }); };
  if (opts.requireHonesty !== false) {
    for (const f of R.HONESTY_FILES) need(f, R.HONESTY, 'missing-honesty-sentence');
    for (const f of R.REVIEW_FILES) need(f, R.REVIEW, 'missing-review-sentence');
  }
  const ap = path.join(root, 'eval', 'approvals.json');
  if (fs.existsSync(ap)) { try { for (const a of JSON.parse(fs.readFileSync(ap, 'utf8'))) if (!a.text) findings.push({ path: 'eval/approvals.json', line: 0, rule: 'approval-missing-text' }); } catch (e) { findings.push({ path: 'eval/approvals.json', line: 0, rule: 'approvals-unreadable' }); } }
  return findings;
}
function localTerms(root) {
  const p = path.join(root, '.denylist.local');
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
}
module.exports = { scan, localTerms };
if (require.main === module) {
  const terms = localTerms(ROOT);
  const underTest = !!process.env.NODE_TEST_CONTEXT;
  if (!underTest && (!terms || terms.length < 3)) { console.error('denylist: .denylist.local is missing or has fewer than 3 terms'); process.exit(2); }
  const args = process.argv.slice(2);
  const f = scan(ROOT, { localTerms: terms || [], extraPaths: args.length ? args : null });
  for (const x of f) console.log(`${x.path}:${x.line}:${x.rule}`);
  console.log(f.length ? `denylist: ${f.length} finding(s)` : `denylist: clean (.denylist.local present with ${terms ? terms.length : 0} terms)`);
  process.exit(f.length ? 2 : 0);
}