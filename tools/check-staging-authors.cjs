'use strict';
// Packaging guard: refuses (exit 1) if the staging repo has any commit, on any ref, whose author or committer
// email is not a GitHub noreply address. Usage: node tools/check-staging-authors.cjs <staging-repo-dir>
// Prints counts and short hashes only, never the offending email.
const { execFileSync } = require('child_process');
const NOREPLY = /^([0-9]+\+)?[A-Za-z0-9-]+@users\.noreply\.github\.com$/;
function check(dir) {
  const out = execFileSync('git', ['-C', dir, 'log', '--all', '--format=%h %ae %ce'], { encoding: 'utf8' });
  const bad = [];
  for (const line of out.split(/\r?\n/).filter(Boolean)) {
    const [h, a, c] = line.split(' ');
    if (!NOREPLY.test(a) || !NOREPLY.test(c)) bad.push(h);
  }
  return { total: out.split(/\r?\n/).filter(Boolean).length, bad };
}
module.exports = { check, NOREPLY };
if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: check-staging-authors.cjs <staging-repo-dir>'); process.exit(2); }
  const r = check(dir);
  if (r.bad.length) { console.error('REFUSED: ' + r.bad.length + ' of ' + r.total + ' commits have a non-noreply author or committer email: ' + r.bad.join(' ')); process.exit(1); }
  console.log('ok: ' + r.total + ' commits, all noreply');
}