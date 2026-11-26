'use strict';
// OWNER-RUN ONLY. Agents must not run this script (SPEC 1.1 rule 4).
const { freezeStage, GuardError } = require('../src/freeze.cjs');
const path = require('path');
const args = process.argv.slice(2);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
try {
  const r = freezeStage(val('--stage'), path.join(__dirname, '..'), { model: val('--model'), tau: val('--tau'), amend: args.includes('--amend') });
  console.log(`freeze stage ${r.stage} written. Commit ${r.commit}\nPaste into eval/HISTORY.md, commit that file, then run the next stage:\n${r.message}`);
} catch (e) {
  console.error('freeze refused: ' + e.message);
  process.exit(e instanceof GuardError ? 2 : 1);
}