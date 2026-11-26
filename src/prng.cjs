'use strict';
const crypto = require('crypto');
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str, salt) {
  const h = crypto.createHash('sha256').update(String(salt) + '|' + str).digest();
  return h.readUInt32BE(0);
}
function shuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
module.exports = { mulberry32, hashSeed, shuffle, pick };