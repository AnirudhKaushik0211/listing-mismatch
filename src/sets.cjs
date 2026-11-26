'use strict';
// The only loader of manifests, labels and planting logs (SPEC 10.4). Held-out sets need a runner capability.
const fs = require('fs');
const path = require('path');
const Lab = require('../labelling/labelling.js');
const ROOT = path.join(__dirname, '..');
const SETS = {
  'natural-dev': { manifest: 'data/splits/natural-dev.json', labels: 'data/labels/natural-dev.labels.json', heldout: false },
  'planted-dev': { manifest: 'data/splits/planted-dev.json', log: 'data/splits/planting-log-dev.jsonl', heldout: false },
  'natural-heldout': { manifest: 'data/heldout/natural-heldout.json', labels: 'data/labels/natural-heldout.labels.json', heldout: true },
  'planted-heldout': { manifest: 'data/heldout/planted-heldout.json', log: 'data/heldout/planting-log-heldout.jsonl', heldout: true },
  // Synthetic fixture sets (tests and the mock pipeline). Never real data.
  'fixture-planted': { manifest: 'test/fixtures/fixture-planted.json', fixture: true },
  'fixture-natural': { manifest: 'test/fixtures/fixture-natural.json', labels: 'test/fixtures/natural.fixture-labels.json', fixture: true }
};
const TOKEN = Symbol('runner-capability');
class CapabilityError extends Error { constructor(m) { super(m); this.exitCode = 2; } }
// Only the counted-run path (listing-check after the freeze checks) and eval (after a counted run exists) call this.
function makeRunnerCapability(proof) {
  if (!proof || proof.freezeVerified !== true) throw new CapabilityError('runner capability requires verified freeze checks');
  return Object.freeze({ [TOKEN]: true, by: proof.by });
}
const hasCap = (c) => !!(c && c[TOKEN] === true);
const isHeldout = (name) => !!(SETS[name] && SETS[name].heldout);
const isFixture = (name) => !!(SETS[name] && SETS[name].fixture);
function assertKnown(name) { if (!SETS[name]) { const e = new Error('unknown set: ' + name); e.exitCode = 1; throw e; } }
function loadSet(name, { capability, root } = {}) {
  assertKnown(name);
  if (SETS[name].heldout && !hasCap(capability)) throw new CapabilityError('held-out set refused without runner capability: ' + name);
  const r = root || ROOT;
  return JSON.parse(fs.readFileSync(path.join(r, SETS[name].manifest), 'utf8'));
}
// Ground truth of planted sets comes only from the `planted` field of the manifest (written by the planting step).
function loadPlantingLog(name, { capability, root } = {}) {
  assertKnown(name);
  if (SETS[name].heldout && !hasCap(capability)) throw new CapabilityError('held-out log refused without runner capability: ' + name);
  const p = path.join(root || ROOT, SETS[name].log || '');
  if (!SETS[name].log || !fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
// Loads and validates owner labels for a natural set. Returns {state} or null when the file does not exist.
function loadLabels(name, { capability, root, tasks, allowSynthetic } = {}) {
  assertKnown(name);
  if (SETS[name].heldout && !hasCap(capability)) throw new CapabilityError('held-out labels refused without runner capability: ' + name);
  const p = path.join(root || ROOT, SETS[name].labels || '');
  if (!SETS[name].labels || !fs.existsSync(p)) return null;
  const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (obj.synthetic === true && !allowSynthetic) { const e = new Error('synthetic label file refused for a non-mock run'); e.exitCode = 2; throw e; }
  if (obj.synthetic === true) return { state: obj, synthetic: true, file: obj };
  const v = Lab.validateLabelFile(obj, tasks, name);
  if (!v.ok) { const e = new Error('label file invalid: ' + v.error); e.exitCode = 2; throw e; }
  return { state: v.state, synthetic: false, file: obj };
}
module.exports = { SETS, loadSet, loadPlantingLog, loadLabels, makeRunnerCapability, CapabilityError, isHeldout, isFixture, ROOT };