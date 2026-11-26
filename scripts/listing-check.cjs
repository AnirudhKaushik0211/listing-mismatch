'use strict';
// Runs a checker (VLM or baseline) over sets and writes eval/results-private/<runId>/<set>.<checker>.jsonl.
const fs = require('fs');
const path = require('path');
const sets = require('../src/sets.cjs');
const { runVlm, PROVIDERS, RunError, writePartial } = require('../src/vlm/client.cjs');
const colourBase = require('../src/baseline/colour.cjs');
const textBase = require('../src/baseline/text.cjs');
const freeze = require('../src/freeze.cjs');
const log = require('../src/log.cjs');
const ROOT = path.join(__dirname, '..');
// Baseline tuning values chosen on planted-dev (SPEC 5.1), hashed at stage 2; flags override for the tuning grid.
const TUNED = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'eval', 'baseline-tuning.json'), 'utf8')); } catch (e) { return {}; } })();
const KNOWN = ['--checker', '--sets', '--provider', '--model', '--yes', '--concurrency', '--max-calls', '--heldout-run', '--reason', '--smoke', '--run-id', '--tau', '--continue-run', '--colour-fg', '--colour-share', '--min-interval-ms', '--ids'];
function parseArgs(argv) {
  const o = { flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!KNOWN.includes(a)) throw Object.assign(new Error('unknown flag: ' + a), { exitCode: 1 });
    if (['--yes', '--smoke'].includes(a)) o.flags[a] = true; else o.flags[a] = argv[++i];
  }
  return o;
}
function die(msg, code) { log.error(msg); process.exit(code); }
async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const smoke = !!flags['--smoke'];
  const checker = flags['--checker'] || 'vlm';
  if (!['vlm', 'baseline-colour', 'baseline-text'].includes(checker)) die('unknown checker', 1);
  const provider = flags['--provider'] || process.env.LISTING_VLM_PROVIDER || 'gemini';
  const model = flags['--model'] || process.env.LISTING_VLM_MODEL || null;
  if (checker === 'vlm' && !PROVIDERS.includes(provider)) die('unknown provider', 1);
  const names = smoke ? ['planted-dev'] : String(flags['--sets'] || '').split(',').filter(Boolean);
  if (!names.length) die('usage: --checker vlm|baseline-colour|baseline-text --sets <list> [--provider P] [--model M] [--yes]', 1);
  const heldoutRequested = names.some((n) => sets.isHeldout(n));
  // --ids <id,id,...>: dev-only subset (used when a provider's daily cap allows only a few calls). Refused with any held-out set.
  const idList = flags['--ids'] ? String(flags['--ids']).split(',').map((s) => s.trim()).filter(Boolean) : null;
  if (idList && heldoutRequested) die('--ids is dev-only and refuses held-out sets', 2);
  if (idList && smoke) die('--ids cannot be combined with --smoke', 1);
  let capability;
  if (heldoutRequested) {
    try {
      const proof = freeze.checkHeldoutRun({ provider, model, reason: flags['--reason'], runNumber: Number(flags['--heldout-run']), continueRun: flags['--continue-run'] });
      capability = sets.makeRunnerCapability({ ...proof, by: 'listing-check' });
    } catch (e) { die(e.message, e.exitCode || 1); }
  }
  if (checker === 'vlm' && provider === 'mock' && heldoutRequested) die('mock refuses held-out sets', 2);
  const runId = flags['--run-id'] || `dev-${checker}-${provider}`;
  const outDir = path.join(ROOT, 'eval', 'results-private', runId);
  fs.mkdirSync(outDir, { recursive: true });
  const prices = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'eval', 'prices.json'), 'utf8')); } catch (e) { return null; } })();
  let promptHash = null, wrote = 0;
  for (const name of names) {
    let listings;
    try { listings = sets.loadSet(name, { capability }); } catch (e) { die(e.message, e.exitCode || 2); }
    if (smoke) listings = listings.slice(0, 3);
    if (idList) listings = listings.filter((l) => idList.includes(l.id));
    const imageRoot = sets.isFixture(name) ? path.join(ROOT, 'test', 'fixtures') : path.join(ROOT, 'data');
    let records;
    if (checker === 'vlm') {
      try {
        const r = await runVlm({ listings, provider, model, imageRoot, cacheDir: path.join(ROOT, 'eval', 'cache'), concurrency: flags['--concurrency'] ? Number(flags['--concurrency']) : undefined, maxCalls: smoke ? 3 : flags['--max-calls'] ? Number(flags['--max-calls']) : undefined, minIntervalMs: flags['--min-interval-ms'] ? Number(flags['--min-interval-ms']) : undefined, yes: !!flags['--yes'], prices });
        if (r.needsConfirm) {
          const e = r.estimate;
          log.line(`estimate for ${name}: ${e.listings} listings, about ${e.inputTokens} input and ${e.outputTokens} output tokens, cost ${e.costUsd === null ? 'not computed (no eval/prices.json entry)' : '$' + e.costUsd.toFixed(4)}. No call made. Re-run with --yes to send.`);
          continue;
        }
        records = r.records;
        promptHash = records.length ? records[0].promptHash : promptHash;
      } catch (e) { const pf = writePartial(outDir, name, checker, e); if (pf) log.line('partial records written: ' + path.relative(ROOT, pf)); die(e.message, e.exitCode || 1); }
    } else {
      records = listings.map((l) => {
        const bytes = fs.readFileSync(path.join(imageRoot, l.image));
        return checker === 'baseline-colour' ? colourBase.checkListing(l, bytes, { fg: Number(flags['--colour-fg'] || TUNED.fg || 235), share: Number(flags['--colour-share'] || TUNED.share || 0.25) }) : textBase.checkListing(l);
      });
    }
    wrote++;
    fs.writeFileSync(path.join(outDir, `${name}.${checker}.jsonl`), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
    log.line(`check ${checker} ${name}: ${records.length} listings written` + (sets.isHeldout(name) ? ' (held-out: counts only)' : ''));
  }
  if (!wrote) return;
  const runFile = path.join(outDir, 'run.json');
  const prev = fs.existsSync(runFile) ? JSON.parse(fs.readFileSync(runFile, 'utf8')) : {};
  const meta = { ...prev, runId, tau: flags['--tau'] ? Number(flags['--tau']) : prev.tau !== undefined ? prev.tau : 0.7, checkers: [...new Set([...(prev.checkers || []), checker])].sort(), sets: [...new Set([...(prev.sets || []), ...names])].sort(), ...(idList ? { ids: [...new Set([...(prev.ids || []), ...idList])].sort() } : {}) };
  if (checker === 'vlm') Object.assign(meta, { provider, model: provider === 'mock' ? 'mock' : model, promptHash });
  fs.writeFileSync(runFile, JSON.stringify(meta, null, 1) + '\n');
  if (checker === 'vlm' && provider !== 'mock') {
    fs.mkdirSync(path.join(ROOT, 'eval'), { recursive: true });
    fs.appendFileSync(path.join(ROOT, 'eval', 'runs.jsonl'), JSON.stringify({ status: smoke ? 'smoke' : 'dev', provider, model, sets: names, runId }) + '\n');
  }
}
main().catch((e) => { log.error(e instanceof RunError ? e.message : 'unexpected error: ' + e.message); process.exit(e.exitCode || 1); });