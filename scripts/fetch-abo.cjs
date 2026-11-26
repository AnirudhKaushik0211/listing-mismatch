'use strict';
// Downloads ABO listing metadata + image metadata from the dataset's public bucket only.
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const HOST = 'https://amazon-berkeley-objects.s3.amazonaws.com';
const RAW = path.join(__dirname, '..', 'data', 'raw');
fs.mkdirSync(RAW, { recursive: true });

async function get(rel, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return;
  const res = await fetch(`${HOST}/${rel}`);
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
  console.log(rel, fs.statSync(dest).size);
}

(async () => {
  await get('archives/abo-listings.tar', path.join(RAW, 'abo-listings.tar'));
  await get('images/metadata/images.csv.gz', path.join(RAW, 'images.csv.gz'));
})().catch((e) => { console.error(e.message); process.exit(1); });
