'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const secrets = require('../src/secrets.cjs');
const { scan, localTerms } = require('../scripts/denylist.cjs');
const R = require('../src/denylist-rules.cjs');
const { ROOT } = require('./helpers.cjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lms-'));
const put = (d, rel, text) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text); };
// Seeded fixtures are assembled from pieces so this test file does not itself contain a key-shaped string.
const googleKey = 'AI' + 'za' + 'A'.repeat(35);
const openaiKey = 'sk' + '-' + 'B'.repeat(30);
test('redact removes known env values and key shapes; the logger redacts', () => {
  process.env.GEMINI_API_KEY = 'unit-test-secret-value-123';
  try {
    assert.strictEqual(secrets.redact('x unit-test-secret-value-123 y'), 'x [redacted] y');
    assert.strictEqual(secrets.redact('k ' + googleKey), 'k [redacted]');
    assert.strictEqual(secrets.getKey('gemini'), 'unit-test-secret-value-123');
    const r = spawnSync(process.execPath, ['-e', "require('./src/log.cjs').error('leak unit-test-secret-value-123')"], { cwd: ROOT, env: { ...process.env }, encoding: 'utf8' });
    assert.ok(!r.stderr.includes('unit-test-secret-value-123') && r.stderr.includes('[redacted]'));
  } finally { delete process.env.GEMINI_API_KEY; }
});
test('denylist detects each rule on seeded fixtures and never prints the match', () => {
  const d = tmp();
  put(d, 'a.txt', `key ${googleKey}\n`);
  put(d, 'b.txt', `token ${openaiKey}\n`);
  put(d, 'c.txt', 'header x-api-key: ' + 'C'.repeat(20) + '\n');
  put(d, 'd.txt', 'path ' + 'C:' + '\\Users\\someone\\file' + '\n' + 'posix ' + '/home/someone/x' + '\n');
  put(d, 'e.txt', 'mentions Secret-Term here\n');
  put(d, 'README.md', 'We have users and customers, adoption, used by many, in production.\nThere are no users, no production deployment and no adoption.\n');
  put(d, 'docs/PRD.md', 'users are fine in design docs\n');
  const f = scan(d, { localTerms: ['secret-term'], requireHonesty: false });
  const rules = (p) => f.filter((x) => x.path === p).map((x) => x.rule);
  assert.deepStrictEqual(rules('a.txt'), ['key-google']); assert.deepStrictEqual(rules('b.txt'), ['key-openai']); assert.deepStrictEqual(rules('c.txt'), ['key-header']);
  assert.deepStrictEqual(rules('d.txt'), ['path-windows-home', 'path-posix-home']); assert.deepStrictEqual(rules('e.txt'), ['owner-private-term']);
  assert.ok(rules('README.md').every((r) => r === 'banned-phrase') && rules('README.md').length >= 5);
  assert.strictEqual(f.filter((x) => x.path === 'README.md' && x.line === 2).length, 0); // allowlisted sentence
  assert.strictEqual(rules('docs/PRD.md').length, 0); // banned phrases only apply to publishable outputs
  assert.ok(f.every((x) => Object.keys(x).sort().join() === 'line,path,rule'));
});
test('denylist finds an exact env secret value in any file, including cache directories', () => {
  const d = tmp(); put(d, 'eval/cache/x.json', '{"v":"zzz-env-secret-value-zzz"}');
  process.env.OPENAI_API_KEY = 'zzz-env-secret-value-zzz';
  try { assert.deepStrictEqual(scan(d, { localTerms: [], requireHonesty: false }).map((x) => x.rule), ['env-secret-value']); } finally { delete process.env.OPENAI_API_KEY; }
});
test('denylist CLI exits 2 on a missing or short .denylist.local (outside the test runner) and prints no match text', () => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const d = tmp(); fs.cpSync(path.join(ROOT, 'src'), path.join(d, 'src'), { recursive: true }); fs.mkdirSync(path.join(d, 'scripts')); fs.copyFileSync(path.join(ROOT, 'scripts/denylist.cjs'), path.join(d, 'scripts/denylist.cjs'));
  put(d, 'x.txt', 'seed ' + googleKey);
  let r = spawnSync(process.execPath, [path.join(d, 'scripts/denylist.cjs')], { cwd: d, env, encoding: 'utf8' });
  assert.strictEqual(r.status, 2); assert.ok(/denylist\.local/.test(r.stderr));
  put(d, '.denylist.local', 'one\ntwo\n'); r = spawnSync(process.execPath, [path.join(d, 'scripts/denylist.cjs')], { cwd: d, env, encoding: 'utf8' }); assert.strictEqual(r.status, 2);
  put(d, '.denylist.local', 'one\ntwo\nthree\n'); r = spawnSync(process.execPath, [path.join(d, 'scripts/denylist.cjs')], { cwd: d, env, encoding: 'utf8' });
  assert.strictEqual(r.status, 2); assert.ok(r.stdout.includes('x.txt:1:key-google')); assert.ok(!r.stdout.includes(googleKey));
});
test('honesty and review sentences are enforced where the files exist', () => {
  const d = tmp(); put(d, 'README.md', 'nothing here\n'); put(d, 'docs/CASE-STUDY.md', R.HONESTY + '\n');
  const f = scan(d, { localTerms: [] }).map((x) => `${x.path}:${x.rule}`);
  assert.ok(f.includes('README.md:missing-honesty-sentence') && f.includes('README.md:missing-review-sentence') && f.includes('docs/CASE-STUDY.md:missing-review-sentence'));
  assert.ok(!f.includes('docs/CASE-STUDY.md:missing-honesty-sentence'));
  put(d, 'docs/X.md', ''); put(d, 'eval/approvals.json', '[{"item":"gate","date":"d"}]');
  assert.ok(scan(d, { localTerms: [], requireHonesty: false }).some((x) => x.rule === 'approval-missing-text'));
});
test('the project documents and the repository scan clean (G09 rules)', () => {
  const docs = ['docs/PRD.md', 'docs/SPEC.md', 'docs/DATA-PLAN.md', 'docs/AMENDMENTS.md'].filter((p) => fs.existsSync(path.join(ROOT, p)));
  assert.strictEqual(docs.length, 4);
  const f = scan(ROOT, { localTerms: localTerms(ROOT) || [], extraPaths: docs });
  assert.deepStrictEqual(f, []);
  const all = scan(ROOT, { localTerms: localTerms(ROOT) || [] });
  assert.deepStrictEqual(all, []);
});
test('set-key.ps1 static assertions (SPEC 11.1)', () => {
  const t = fs.readFileSync(path.join(ROOT, 'scripts/set-key.ps1'), 'utf8');
  assert.ok(/Read-Host[^\n]*-AsSecureString/.test(t) && /ZeroFreeBSTR/.test(t) && /\[Environment\]::SetEnvironmentVariable\(\$varName, \$plain, 'User'\)/.test(t));
  assert.ok(!/Write-Host[^\n]*\$plain/.test(t) && !/Write-Output[^\n]*\$plain/.test(t) && !/(Out-File|Set-Content|Add-Content|\[IO\.File\]|Export-)[^\n]*\$plain/.test(t) && !/Start-Transcript/.test(t));
  assert.ok(/'gemini','openai','anthropic'/.test(t) && /\[switch\]\$SkipVerify/.test(t) && /\[switch\]\$SetDefault/.test(t) && /Nothing was saved/.test(t));
  // the only assignment of a stored variable comes after both refusal branches
  const idxSave = t.indexOf('SetEnvironmentVariable($varName');
  assert.ok(idxSave > t.indexOf('Nothing was saved') && idxSave > t.indexOf('Could not verify'));
  assert.strictEqual((t.match(/SetEnvironmentVariable\(\$varName/g) || []).length, 1);
  assert.ok(/GEMINI_API_KEY/.test(t) && /OPENAI_API_KEY/.test(t) && /ANTHROPIC_API_KEY/.test(t));
});