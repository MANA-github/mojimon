/*
 * 採点項目
 * ------------------------------------------------------------
 * 各関数は (検出結果 det, 設定 cfg) を受け取り 0〜100 の点数を返す。
 * cfg は config.js の metrics の中で key が一致する項目。
 * 新しい項目を追加するときは、ここに関数を書き、config.js の metrics に
 * 同じ key で名前・重みなどを追加してください。
 */
const METRICS = {

  /* 大きさの揃い：文字サイズのばらつき */
  size(det, cfg) {
    const main = det.all.filter(c => !c.minor);
    return toScore(cv(main.map(c => c.size)), cfg.good, cfg.bad);
  },

  /* 行のまっすぐさ：行ごとに直線を当てはめ、上下ずれと傾きを見る */
  line(det, cfg) {
    const resids = [], slopes = [];
    det.lines.forEach(l => {
      const cs = l.chars.filter(c => !c.minor);
      l.fit = null;
      if (cs.length < 3) return;
      const xs = cs.map(c => c.cx), ys = cs.map(c => c.cy);
      const mx = mean(xs), my = mean(ys);
      let sxy = 0, sxx = 0;
      xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
      const b = sxx ? sxy / sxx : 0, a = my - b * mx;
      l.fit = { a, b };   // 解析画像に点線を描くのに使う
      const msz = median(cs.map(c => c.size));
      resids.push(std(ys.map((y, i) => y - (a + b * xs[i]))) / msz);
      slopes.push(Math.abs(Math.atan(b) * 180 / Math.PI));
    });
    if (!resids.length) return null;
    const w = cfg.slopeWeight;
    return (1 - w) * toScore(mean(resids), cfg.good, cfg.bad)
         + w * toScore(mean(slopes), cfg.slopeGood, cfg.slopeBad);
  },

  /* 字間の均等さ：となり同士の隙間のばらつき */
  gap(det, cfg) {
    const vals = [];
    det.lines.forEach(l => {
      const cs = l.chars, gaps = [];
      for (let i = 1; i < cs.length; i++) gaps.push(cs[i].x0 - cs[i - 1].x1);
      if (gaps.length >= 2) vals.push(std(gaps) / (median(cs.map(c => c.size)) || 1));
    });
    return vals.length ? toScore(mean(vals), cfg.good, cfg.bad) : null;
  },

  /* 線の安定感：文字ごとの線の太さのばらつき */
  stroke(det, cfg) {
    const s = det.all.filter(c => !c.minor).map(c => c.stroke).filter(v => v > 0);
    return toScore(cv(s), cfg.good, cfg.bad);
  },

  /* 字形のバランス：インクの重心が文字の中央からどれだけずれているか */
  balance(det, cfg) {
    const b = det.all.filter(c => !c.minor).map(c => Math.hypot(c.bx, c.by));
    return toScore(mean(b), cfg.good, cfg.bad);
  },
};

/* 全項目を採点して合計を出す */
function scoreAll(det) {
  const metrics = CONFIG.metrics.map(cfg => {
    const fn = METRICS[cfg.key];
    if (!fn) throw new Error(`metrics.js に「${cfg.key}」の関数がありません`);
    const s = fn(det, cfg);
    return { ...cfg, score: s == null ? CONFIG.fallbackScore : s };
  });
  const wsum = metrics.reduce((s, m) => s + m.weight, 0) || 1;
  const total = Math.round(metrics.reduce((s, m) => s + m.score * m.weight, 0) / wsum);
  return { metrics, total };
}
