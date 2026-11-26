'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const jpeg = require('jpeg-js');
const ROOT = path.join(__dirname, '..');
function solidJpeg(rgb, bg = [250, 250, 250], inner = true) {
  const W = 64, H = 64, data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, c = !inner || (x >= 14 && x < 50 && y >= 14 && y < 50) ? rgb : bg;
    data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
  }
  return Buffer.from(jpeg.encode({ data, width: W, height: H }, 92).data);
}
// A throwaway copy of the project (code, labelling, fixtures, one dependency) so CLI tests never touch the real eval/ or docs/.
function workdir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-'));
  for (const p of ['src', 'scripts', 'labelling', 'test/fixtures', 'package.json']) fs.cpSync(path.join(ROOT, p), path.join(d, p), { recursive: true });
  fs.cpSync(path.join(ROOT, 'node_modules', 'jpeg-js'), path.join(d, 'node_modules', 'jpeg-js'), { recursive: true });
  for (const p of ['docs', 'demo', 'eval/results']) fs.mkdirSync(path.join(d, p), { recursive: true });
  return d;
}
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', name), 'utf8'));
module.exports = { ROOT, solidJpeg, workdir, fixture };