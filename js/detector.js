/*
 * 写真から「1文字」を切り出す
 * extractChar(RGBAピクセル, 幅, 高さ) →
 *   { x0, y0, w, h, mask, multiple }
 *   mask: w×h の 0/1 配列（1 = インク）
 *   multiple: ほかにも文字らしきものが写っていたら true
 */
function extractChar(px, W, H) {
  const D = CONFIG.detect;
  const ink = binarize(px, W, H, D);
  const { lab, comps } = labelComponents(ink, W, H);

  // ゴミ・罫線・紙の端を除く
  const minArea = Math.max(8, W * H * D.minAreaRatio);
  const cand = comps.filter(c => {
    const w = c.maxx - c.minx + 1, h = c.maxy - c.miny + 1;
    const border = c.minx <= 1 || c.miny <= 1 || c.maxx >= W - 2 || c.maxy >= H - 2;
    if (c.area < minArea) return false;                       // ゴミ
    if (border && (w > W * .25 || h > H * .25)) return false; // 紙の端・影
    if (w > W * .85 && h < H * .05) return false;             // 横罫線
    if (h > H * .85 && w < W * .05) return false;             // 縦罫線
    return true;
  });
  if (!cand.length) throw new Error(CONFIG.text.noChars);

  // いちばん大きい部品から始めて、近くにある部品（濁点・へん等）を足していく
  cand.sort((a, b) => b.area - a.area);
  const sel = new Uint8Array(comps.length + 1);
  const u = { x0: cand[0].minx, y0: cand[0].miny, x1: cand[0].maxx, y1: cand[0].maxy };
  sel[cand[0].id] = 1;
  for (let changed = true; changed;) {
    changed = false;
    for (const c of cand) {
      if (sel[c.id]) continue;
      const size = Math.max(u.x1 - u.x0, u.y1 - u.y0) + 1;
      const dx = Math.max(0, u.x0 - c.maxx, c.minx - u.x1);
      const dy = Math.max(0, u.y0 - c.maxy, c.miny - u.y1);
      if (Math.max(dx, dy) <= size * D.joinDistance) {
        sel[c.id] = 1; changed = true;
        u.x0 = Math.min(u.x0, c.minx); u.y0 = Math.min(u.y0, c.miny);
        u.x1 = Math.max(u.x1, c.maxx); u.y1 = Math.max(u.y1, c.maxy);
      }
    }
  }
  const w = u.x1 - u.x0 + 1, h = u.y1 - u.y0 + 1;
  if (Math.max(w, h) < D.minCharPixels) throw new Error(CONFIG.text.tooSmall);

  const selArea = cand.filter(c => sel[c.id]).reduce((s, c) => s + c.area, 0);
  const multiple = cand.some(c => !sel[c.id] && c.area > selArea * D.otherCharRatio);

  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = lab[(y + u.y0) * W + x + u.x0];
    if (l && sel[l]) mask[y * w + x] = 1;
  }
  return { x0: u.x0, y0: u.y0, w, h, mask, multiple };
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

/* つながっているインクごとに番号を振る */
function labelComponents(ink, W, H) {
  const N = W * H, lab = new Int32Array(N), comps = [], stack = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    if (!ink[i] || lab[i]) continue;
    const id = comps.length + 1; let sp = 0; stack[sp++] = i; lab[i] = id;
    const c = { id, minx: W, miny: H, maxx: 0, maxy: 0, area: 0 };
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
  return { lab, comps };
}
