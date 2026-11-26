'use strict';
// Applies planting to the assigned planted sets and writes manifests, planting logs and image-hash files.
// Held-out sets: prints counts only.
const fs = require('fs');
const path = require('path');
const { plantSet } = require('../src/plant.cjs');
const { canonicalManifest } = require('../src/hash.cjs');
const ROOT = path.join(__dirname, '..');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const write = (rel, text) => { const p = path.join(ROOT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const hashes = (ls) => ls.map((l) => `${l.id} ${l.imageSha256}`).sort().join('\n') + '\n';
const jobs = [
  { set: 'planted-dev', src: 'data/splits/planted-dev.assigned.json', manifest: 'data/splits/planted-dev.json', log: 'data/splits/planting-log-dev.jsonl', hashes: 'data/splits/image-hashes-planted-dev.txt', heldout: false },
  { set: 'planted-heldout', src: 'data/heldout/planted-heldout.assigned.json', manifest: 'data/heldout/planted-heldout.json', log: 'data/heldout/planting-log-heldout.jsonl', hashes: 'data/heldout/image-hashes-planted-heldout.txt', heldout: true }
];
for (const j of jobs) {
  const { listings, log } = plantSet(read(j.src), j.set);
  write(j.manifest, canonicalManifest(listings));
  write(j.log, log.map((l) => JSON.stringify(l)).join('\n') + '\n');
  write(j.hashes, hashes(listings));
  const by = {};
  for (const l of log) { const k = l.attribute + (l.stratum ? '/' + l.stratum : ''); by[k] = (by[k] || 0) + 1; }
  console.log(`plant ${j.set}: ${listings.length} listings, ${log.length} planted, ${listings.length - log.length} controls`);
  console.log('  by condition: ' + JSON.stringify(by));
  console.log('  titleRewritten false: ' + log.filter((l) => !l.titleRewritten).length);
  if (!j.heldout) log.slice(0, 10).forEach((l) => console.log(`  [${l.attribute}${l.stratum ? '/' + l.stratum : ''}] ${l.titleBefore}  ->  ${l.titleAfter}`));
}
for (const [set, rel] of [['natural-dev', 'data/splits/natural-dev.json'], ['natural-heldout', 'data/heldout/natural-heldout.json']]) {
  const ls = read(rel);
  write(rel.replace(/[^/]+$/, `image-hashes-${set}.txt`), hashes(ls));
  console.log(`hashes ${set}: ${ls.length}`);
}