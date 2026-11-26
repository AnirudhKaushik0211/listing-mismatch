'use strict';
// Inventory eligible ABO listings, pick categories, select a deterministic sample, download small images.
// Usage: node scripts/sample-abo.cjs inventory | download
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const META = path.join(RAW, 'listings', 'listings', 'metadata');
const HOST = 'https://amazon-berkeley-objects.s3.amazonaws.com';
const PRIORITY = ['SHOES', 'SANDAL', 'BOOT', 'SHIRT', 'DRESS', 'SWEATER', 'HANDBAG', 'RUG', 'CUSHION', 'BED', 'SOFA', 'CHAIR', 'LAMP'];
const PER_CAT = 175;
// Deviation from DATA-PLAN 3.5 (recorded in DATA-SOURCES.md): fixed list, threshold 200, because only SHOES and CHAIR reach 250 and the fill rule would pick phone cases.
const FIXED = ['SHOES', 'CHAIR', 'TABLE', 'SOFA'];
const MAX_CATS = 4;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const en = (a) => (Array.isArray(a) ? a.find((x) => x && /^en/i.test(x.language_tag || '') && x.value && String(x.value).trim()) : null);

function loadImages() {
  const lines = zlib.gunzipSync(fs.readFileSync(path.join(RAW, 'images.csv.gz'))).toString('utf8').split(/\r?\n/);
  const map = new Map();
  for (const l of lines.slice(1)) {
    const p = l.split(',');
    if (p.length >= 4) map.set(p[0], { w: +p[2], h: +p[1], path: p[3] });
  }
  return map;
}

function candidates() {
  const images = loadImages();
  const out = [];
  const stats = { total: 0, eligible: 0 };
  const seenGroup = new Set();
  for (const f of fs.readdirSync(META).filter((n) => n.endsWith('.json.gz')).sort()) {
    const lines = zlib.gunzipSync(fs.readFileSync(path.join(META, f))).toString('utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      stats.total++;
      const r = JSON.parse(line);
      const title = en(r.item_name), colour = en(r.color), material = en(r.material);
      const pt = r.product_type && r.product_type[0] && r.product_type[0].value;
      const img = images.get(r.main_image_id);
      if (!title || !colour || !material || !pt || !img) continue;
      const t = String(title.value).trim();
      if (t.length < 10 || t.length > 250) continue;
      const group = r.model_name && r.model_name[0] ? `${en(r.brand) ? en(r.brand).value : ''}|${r.model_name[0].value}` : `${en(r.brand) ? en(r.brand).value : ''}|${t.toLowerCase().slice(0, 40)}`;
      const key = `${pt}|${group}`;
      if (seenGroup.has(key)) continue;
      seenGroup.add(key);
      stats.eligible++;
      out.push({ item_id: r.item_id, product_type: pt, title: t, colour: String(colour.value).trim(), material: String(material.value).trim(),
        country: r.country || null, marketplace: r.marketplace || null, main_image_id: r.main_image_id, image_path: img.path, w: img.w, h: img.h });
    }
  }
  return { out, stats };
}

function choose(out) {
  const counts = {};
  for (const c of out) counts[c.product_type] = (counts[c.product_type] || 0) + 1;
  const eligible = Object.keys(counts).filter((k) => counts[k] >= 250);
  const chosen = PRIORITY.filter((k) => eligible.includes(k));
  for (const k of eligible.sort((a, b) => counts[b] - counts[a])) if (chosen.length < 5 && !chosen.includes(k)) chosen.push(k);
  return { counts, chosen: FIXED.filter((k) => counts[k] >= 200) };
}

function select(out, cats) {
  const sel = [];
  for (const c of cats) {
    const list = out.filter((x) => x.product_type === c).sort((a, b) => (sha('listing-mismatch-v1|' + a.item_id) < sha('listing-mismatch-v1|' + b.item_id) ? -1 : 1));
    sel.push(...list);
  }
  return sel;
}

async function download(sel, cats) {
  const dir = path.join(ROOT, 'data', 'images');
  const kept = [];
  const perCat = {};
  let tried = 0, failed = 0;
  const seenHash = new Set();
  for (const c of cats) {
    perCat[c] = 0;
    for (const x of sel.filter((s) => s.product_type === c)) {
      if (perCat[c] >= PER_CAT) break;
      tried++;
      try {
        const res = await fetch(`${HOST}/images/small/${x.image_path}`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 1024 || buf.length > 2 * 1024 * 1024 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('bad jpeg');
        const h = crypto.createHash('sha256').update(buf).digest('hex');
        if (seenHash.has(h)) continue;
        seenHash.add(h);
        const d = path.join(dir, h.slice(0, 2));
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, h + '.jpg'), buf);
        kept.push({ ...x, imageSha256: h, image_file: `images/${h.slice(0, 2)}/${h}.jpg`, image_bytes: buf.length });
        perCat[c]++;
      } catch (e) { failed++; }
    }
  }
  return { kept, perCat, tried, failed };
}

(async () => {
  const mode = process.argv[2];
  const { out, stats } = candidates();
  const { counts, chosen } = choose(out);
  fs.mkdirSync(path.join(ROOT, 'data', 'splits'), { recursive: true });
  if (mode === 'inventory') {
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 25);
    fs.writeFileSync(path.join(ROOT, 'data', 'splits', 'inventory.json'), JSON.stringify({ stats, countsByProductType: counts, chosen }, null, 1));
    console.log(stats, top, chosen);
    return;
  }
  const { kept, perCat, tried, failed } = await download(select(out, chosen), chosen);
  fs.writeFileSync(path.join(ROOT, 'data', 'splits', 'abo-sample.json'), JSON.stringify(kept, null, 1));
  console.log({ tried, failed, perCat, total: kept.length });
})().catch((e) => { console.error(e); process.exit(1); });

