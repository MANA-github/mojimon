/*
 * お手本（フォントで描いた文字）との形の比較
 * ------------------------------------------------------------
 * 1. 文字を同じ大きさのマス（grid×grid）に正規化
 * 2. 細線化して「骨組み」だけにする（線の太さの違いを無視するため）
 * 3. 骨組み同士の距離（チャンファー距離）を測る → 小さいほど形が近い
 * 書いた文字は少し傾けたもの（shears）も試し、いちばん近いものを採用する。
 */

/* ---------- ビットマップ処理 ---------- */

// 0/1 マスクを長辺 maxDim に拡大縮小。セルのインク率が thr を超えたら 1
function resample(mask, w, h, maxDim, thr) {
  const s = maxDim / Math.max(w, h);
  const ow = Math.max(1, Math.round(w * s)), oh = Math.max(1, Math.round(h * s));
  const I = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += mask[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
  }
  const out = new Uint8Array(ow * oh);
  for (let j = 0; j < oh; j++) {
    const y0 = Math.min(h - 1, Math.floor(j / s)), y1 = Math.max(y0 + 1, Math.min(h, Math.floor((j + 1) / s)));
    for (let i = 0; i < ow; i++) {
      const x0 = Math.min(w - 1, Math.floor(i / s)), x1 = Math.max(x0 + 1, Math.min(w, Math.floor((i + 1) / s)));
      const sum = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      if (sum / ((x1 - x0) * (y1 - y0)) > thr) out[j * ow + i] = 1;
    }
  }
  return { data: out, w: ow, h: oh };
}

// ビットマップを傾け（shear）てから grid×grid の中央に収める
function normalizeToGrid(bm, shear) {
  const G = CONFIG.match.grid, inner = G - 2 * CONFIG.match.pad;
  const cy = bm.h / 2;
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (let y = 0; y < bm.h; y++) for (let x = 0; x < bm.w; x++) {
    if (!bm.data[y * bm.w + x]) continue;
    const tx = x + shear * (y - cy);
    if (tx < minx) minx = tx; if (tx + 1 > maxx) maxx = tx + 1;
    if (y < miny) miny = y; if (y + 1 > maxy) maxy = y + 1;
  }
  const bw = maxx - minx, bh = maxy - miny;
  const s = inner / Math.max(bw, bh);
  const ox = (G - bw * s) / 2 - minx * s, oy = (G - bh * s) / 2 - miny * s;
  const grid = new Uint8Array(G * G);
  for (let y = 0; y < bm.h; y++) for (let x = 0; x < bm.w; x++) {
    if (!bm.data[y * bm.w + x]) continue;
    const tx = x + shear * (y - cy);
    const gx0 = Math.floor(tx * s + ox), gx1 = Math.max(gx0 + 1, Math.ceil((tx + 1) * s + ox));
    const gy0 = Math.floor(y * s + oy), gy1 = Math.max(gy0 + 1, Math.ceil((y + 1) * s + oy));
    for (let gy = gy0; gy < gy1; gy++) for (let gx = gx0; gx < gx1; gx++)
      if (gx >= 0 && gy >= 0 && gx < G && gy < G) grid[gy * G + gx] = 1;
  }
  return { grid, aspect: bw / bh };
}

// Zhang-Suen 細線化
function thin(src, w, h) {
  const a = Uint8Array.from(src);
  const P = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : a[y * w + x];
  for (let changed = true; changed;) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const del = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!a[y * w + x]) continue;
        const n = [P(x, y - 1), P(x + 1, y - 1), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1), P(x - 1, y + 1), P(x - 1, y), P(x - 1, y - 1)];
        const B = n.reduce((s, v) => s + v, 0);
        if (B < 2 || B > 6) continue;
        let A = 0; for (let k = 0; k < 8; k++) if (!n[k] && n[(k + 1) % 8]) A++;
        if (A !== 1) continue;
        if (pass === 0 ? (n[0] * n[2] * n[4] || n[2] * n[4] * n[6]) : (n[0] * n[2] * n[6] || n[0] * n[4] * n[6])) continue;
        del.push(y * w + x);
      }
      if (del.length) { changed = true; del.forEach(i => a[i] = 0); }
    }
  }
  return a;
}

// 各マスから「値が 1 のいちばん近いマス」までの距離（3-4 チャンファー）
function distanceMap(bin, w, h) {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = bin[i] ? 0 : INF;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 3);
    if (y > 0) {
      v = Math.min(v, d[i - w] + 3);
      if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
      if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
    }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
    if (y < h - 1) {
      v = Math.min(v, d[i + w] + 3);
      if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
      if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
    }
    d[i] = v;
  }
  for (let i = 0; i < w * h; i++) d[i] /= 3;
  return d;
}

// 比較に使う特徴（骨組みの点・距離マップ・重心・縦横比）
function features(bm, shear) {
  const G = CONFIG.match.grid;
  const { grid, aspect } = normalizeToGrid(bm, shear);
  const skel = thin(grid, G, G);
  const pts = [];
  for (let i = 0; i < G * G; i++) if (skel[i]) pts.push(i);
  let n = 0, sx = 0, sy = 0;
  for (let i = 0; i < G * G; i++) if (grid[i]) { n++; sx += i % G; sy += (i / G) | 0; }
  return {
    grid, pts, dt: distanceMap(skel, G, G), aspect,
    cx: (sx / n - G / 2) / G, cy: (sy / n - G / 2) / G, shear,
  };
}

// 2つの文字の形の距離（小さいほど似ている）
function chamfer(a, b) {
  if (!a.pts.length || !b.pts.length) return Infinity;
  let s1 = 0, s2 = 0;
  for (const p of a.pts) s1 += b.dt[p];
  for (const p of b.pts) s2 += a.dt[p];
  return (s1 / a.pts.length + s2 / b.pts.length) / 2;
}

/* ---------- お手本 ---------- */
const templateCache = new Map();

// 文字 ch をお手本フォントで描いた特徴のリスト（フォントの数だけ）
function getTemplates(ch) {
  if (templateCache.has(ch)) return templateCache.get(ch);
  const S = 160, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  const list = [], seen = new Set();
  for (const font of CONFIG.match.fonts) {
    g.clearRect(0, 0, S, S);
    g.font = `120px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, S / 2, S / 2);
    const a = g.getImageData(0, 0, S, S).data;
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (a[(y * S + x) * 4 + 3] > 110) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) continue;
    const w = x1 - x0 + 1, h = y1 - y0 + 1, mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y * w + x] = a[((y + y0) * S + x + x0) * 4 + 3] > 110 ? 1 : 0;
    const f = features(resample(mask, w, h, CONFIG.match.bitmapSize, .5), 0);
    const key = f.pts.join(',');
    if (seen.has(key)) continue;   // フォントが無く同じ形になったものは省く
    seen.add(key);
    f.font = font;
    list.push(f);
  }
  templateCache.set(ch, list);
  return list;
}

// 書いた文字（傾きを変えた複数パターン）と文字 ch のいちばん近い組み合わせ
function bestMatch(userVars, ch) {
  let best = { ch, d: Infinity };
  for (const tv of getTemplates(ch)) for (const uv of userVars) {
    const d = chamfer(uv, tv);
    if (d < best.d) best = { ch, d, uv, tv };
  }
  return best;
}

/* ---------- 線の太さのばらつき ---------- */
function strokeVariation(crop) {
  const bm = resample(crop.mask, crop.w, crop.h, CONFIG.match.strokeBitmapSize, .5);
  const inv = bm.data.map(v => 1 - v);
  const dt = distanceMap(inv, bm.w, bm.h);     // インクの中から背景までの距離 = 線の半分の太さ
  const skel = thin(bm.data, bm.w, bm.h);
  const widths = [];
  for (let i = 0; i < skel.length; i++) if (skel[i]) widths.push(dt[i]);
  if (widths.length < 10) return null;
  widths.sort((a, b) => a - b);
  const cut = Math.floor(widths.length * .1);  // 交差点・端の極端な値を除く
  return cv(widths.slice(cut, widths.length - cut));
}

/* ---------- まとめ ---------- */
// 見た目が同じ文字のグループ（カ と 力 など）
function sameShapeGroup(ch) {
  const g = CONFIG.match.sameShape.find(s => s.includes(ch));
  return g ? [...g] : [ch];
}

function judgeChar(crop, target) {
  const bm = resample(crop.mask, crop.w, crop.h, CONFIG.match.bitmapSize, .12);
  const userVars = CONFIG.match.shears.map(s => features(bm, s));
  const group = sameShapeGroup(target);

  const chars = [...new Set([target, ...CONFIG.match.candidates])];
  const ranking = chars.map(ch => bestMatch(userVars, ch))
    .filter(m => isFinite(m.d))
    .sort((a, b) => a.d - b.d);
  const tgt = ranking.find(m => m.ch === target);
  if (!tgt) throw new Error(CONFIG.text.noTemplate);
  const rival = ranking.find(m => !group.includes(m.ch)) || null;

  return {
    target: tgt,
    rival,
    misread: !!rival && rival.d < tgt.d,
    ranking: ranking.filter(m => m.ch === target || !group.includes(m.ch)),
    strokeCv: strokeVariation(crop),
    userPlain: userVars[CONFIG.match.shears.indexOf(0)] || userVars[0],
  };
}
