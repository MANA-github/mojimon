/*
 * 画像から「行」と「文字」を検出する
 * detectChars(RGBAピクセル, 幅, 高さ) → { W, H, lines, all }
 *   lines: [{ y0, y1, chars: [文字...] }]
 *   文字:  { x0, x1, y0, y1, w, h, cx, cy, size, stroke, bx, by, minor, dev }
 */
function detectChars(px, W, H) {
  const D = CONFIG.detect;
  const ink = binarize(px, W, H, D);
  removeNoise(ink, W, H, D);

  // --- 行の検出（水平方向のインク量） ---
  const hp = new Uint32Array(H);
  for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x++) s += ink[y * W + x]; hp[y] = s; }
  let segs = runs(hp);
  if (!segs.length) throw new Error(CONFIG.text.noChars);
  segs = mergeSegs(segs, median(segs.map(segLen)) * D.lineMergeGap);
  const lineH = median(segs.map(segLen));
  segs = segs.filter(s => segLen(s) > lineH * D.minLineHeight);

  // --- 各行の中で文字を切り出す（垂直方向のインク量） ---
  const lines = [];
  for (const [ly0, ly1] of segs) {
    const lh = ly1 - ly0 + 1;
    const vp = new Uint32Array(W);
    for (let y = ly0; y <= ly1; y++) for (let x = 0; x < W; x++) vp[x] += ink[y * W + x];
    let cs = mergeSegs(runs(vp), lh * D.charMergeGap);
    cs = mergeNarrow(cs, lh, D);
    const chars = cs.map(([x0, x1]) => charStats(ink, W, x0, x1, ly0, ly1)).filter(Boolean);
    if (chars.length) lines.push({ y0: ly0, y1: ly1, chars });
  }
  const all = lines.flatMap(l => l.chars);
  if (all.length < 2) throw new Error(CONFIG.text.tooFew);

  // 句読点など極端に小さい文字は採点対象外にする
  const medSize = median(all.map(c => c.size));
  all.forEach(c => {
    c.minor = c.size < medSize * D.minorSize;
    c.dev = Math.abs(c.size - medSize) / medSize;
  });
  return { W, H, lines, all, medSize };
}

/* 適応的二値化：周囲より暗い画素をインクとみなす（影・照明ムラに強い） */
function binarize(px, W, H, D) {
  const N = W * H, gray = new Float32Array(N);
  for (let i = 0; i < N; i++) gray[i] = .299 * px[i * 4] + .587 * px[i * 4 + 1] + .114 * px[i * 4 + 2];
  // 黒板など背景が暗い画像は反転
  let avg = 0; for (let i = 0; i < N; i += 7) avg += gray[i]; avg /= N / 7;
  if (avg < 110) for (let i = 0; i < N; i++) gray[i] = 255 - gray[i];

  const I = new Float64Array((W + 1) * (H + 1));   // 積分画像
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) { row += gray[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; }
  }
  const r = Math.max(8, Math.round(Math.min(W, H) / D.windowDivisor));
  const ink = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
      const s = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
      const m = s / ((x1 - x0) * (y1 - y0)), v = gray[y * W + x];
      if (v < m * D.inkRatio && v < m - D.inkMinDiff) ink[y * W + x] = 1;
    }
  }
  return ink;
}

/* 連結成分ごとに見て、ゴミ・罫線・紙の端を消す（ink を書き換える） */
function removeNoise(ink, W, H, D) {
  const N = W * H, lab = new Int32Array(N), comps = [], stack = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    if (!ink[i] || lab[i]) continue;
    const id = comps.length + 1; let sp = 0; stack[sp++] = i; lab[i] = id;
    const c = { minx: W, miny: H, maxx: 0, maxy: 0, area: 0 };
    while (sp) {
      const p = stack[--sp], x = p % W, y = (p / W) | 0;
      c.area++;
      if (x < c.minx) c.minx = x; if (x > c.maxx) c.maxx = x;
      if (y < c.miny) c.miny = y; if (y > c.maxy) c.maxy = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (ink[q] && !lab[q]) { lab[q] = id; stack[sp++] = q; }
      }
    }
    comps.push(c);
  }
  const minArea = Math.max(8, N * D.minAreaRatio);
  const keep = new Uint8Array(comps.length + 1);
  comps.forEach((c, k) => {
    const w = c.maxx - c.minx + 1, h = c.maxy - c.miny + 1;
    const border = c.minx <= 1 || c.miny <= 1 || c.maxx >= W - 2 || c.maxy >= H - 2;
    if (c.area < minArea) return;                          // ゴミ
    if (border && (w > W * .25 || h > H * .25)) return;   // 紙の端・影
    if (w > W * .55 && h < H * .04) return;                // 横罫線
    if (h > H * .55 && w < W * .04) return;                // 縦罫線
    if (w > W * .8 || h > H * .8) return;                  // 大きすぎる物体
    keep[k + 1] = 1;
  });
  for (let i = 0; i < N; i++) if (lab[i] && !keep[lab[i]]) ink[i] = 0;
}

/* 0 でない区間を [開始, 終了] の配列で返す */
function runs(arr) {
  const out = [];
  for (let i = 0, st = -1; i <= arr.length; i++) {
    const on = i < arr.length && arr[i] > 0;
    if (on && st < 0) st = i;
    if (!on && st >= 0) { out.push([st, i - 1]); st = -1; }
  }
  return out;
}
const segLen = s => s[1] - s[0] + 1;

function mergeSegs(segs, gap) {
  const out = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && s[0] - last[1] - 1 <= gap) last[1] = s[1]; else out.push([...s]);
  }
  return out;
}

/* 偏とつくりなど、横に分かれた部品を1文字にまとめる */
function mergeNarrow(segs, lh, D) {
  let cs = segs.map(s => ({ x0: s[0], x1: s[1], fixed: false }));
  const wid = s => s.x1 - s.x0 + 1;
  while (cs.length > 1) {
    let bi = -1;
    cs.forEach((s, i) => { if (!s.fixed && wid(s) < lh * D.narrowPart && (bi < 0 || wid(s) < wid(cs[bi]))) bi = i; });
    if (bi < 0) break;
    const opts = [];
    if (bi > 0) opts.push({ a: bi - 1, w: cs[bi].x1 - cs[bi - 1].x0 + 1, gap: cs[bi].x0 - cs[bi - 1].x1 });
    if (bi < cs.length - 1) opts.push({ a: bi, w: cs[bi + 1].x1 - cs[bi].x0 + 1, gap: cs[bi + 1].x0 - cs[bi].x1 });
    const o = opts.filter(o => o.w <= lh * D.maxCharWidth).sort((p, q) => p.gap - q.gap)[0];
    if (!o) { cs[bi].fixed = true; continue; }
    cs.splice(o.a, 2, { x0: cs[o.a].x0, x1: cs[o.a + 1].x1, fixed: false });
  }
  return cs.map(s => [s.x0, s.x1]);
}

/* 1文字分の範囲から各種の値を測る */
function charStats(ink, W, x0, x1, y0, y1) {
  let ty0 = Infinity, ty1 = -1, n = 0, sx = 0, sy = 0;
  const strokeRuns = [];
  for (let y = y0; y <= y1; y++) {
    let run = 0;
    for (let x = x0; x <= x1 + 1; x++) {
      const v = x <= x1 && ink[y * W + x];
      if (v) { n++; sx += x; sy += y; run++; if (y < ty0) ty0 = y; if (y > ty1) ty1 = y; }
      else if (run) { strokeRuns.push(run); run = 0; }
    }
  }
  if (!n) return null;
  const w = x1 - x0 + 1, h = ty1 - ty0 + 1, size = Math.max(w, h);
  const cx = (x0 + x1) / 2, cy = (ty0 + ty1) / 2;
  return {
    x0, x1, y0: ty0, y1: ty1, w, h, cx, cy, n, size,
    stroke: median(strokeRuns),   // 線の太さの目安
    bx: (sx / n - cx) / size,     // 重心の横ずれ
    by: (sy / n - cy) / size,     // 重心の縦ずれ
  };
}
