'use strict';
// OWNER-RUN ONLY. Appends a dated approval to eval/approvals.json (SPEC 10.6).
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const item = val('--item'), text = val('--text');
if (!['gate', 'data-use', 'labels-own', 'no-claims'].includes(item) || !text || text.length < 10) { console.error('usage: node scripts/approve.cjs --item gate|data-use|labels-own|no-claims --text "<statement>"'); process.exit(1); }
const p = path.join(__dirname, '..', 'eval', 'approvals.json');
const list = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
list.push({ item, text, date: new Date().toISOString() });
fs.mkdirSync(path.dirname(p), { recursive: true });
fs.writeFileSync(p, JSON.stringify(list, null, 1) + '\n');
console.log('approval recorded: ' + item);