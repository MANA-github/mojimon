/*
 * 採点項目
 * ------------------------------------------------------------
 * 各関数は (判定結果 r, 設定 cfg) を受け取り 0〜100 の点数を返す
 * （判定できないときは null → CONFIG.fallbackScore 点）。
 * cfg は config.js の metrics の中で key が一致する項目。
 *
 * r の中身（js/shape.js の judgeChar が作る）
 *   r.target   お手本との比較 { ch, d（形の距離）, uv（書いた字の特徴）, tv（お手本の特徴） }
 *   r.rival    お手本以外でいちばん形が近い文字（同じ形式）
 *   r.misread  rival の方が近い＝別の字に読めてしまう
 *   r.strokeCv 線の太さのばらつき
 */
const METRICS = {

  /* 字形の正確さ：お手本の骨組みとの距離 */
  shape(r, cfg) {
    return toScore(r.target.d, cfg.good, cfg.bad);
  },

  /* 読みやすさ：ほかの字よりどれだけはっきりお手本に近いか */
  legibility(r, cfg) {
    if (!r.rival) return 100;
    return toScore(r.target.d / r.rival.d, cfg.good, cfg.bad);
  },

  /* バランス：重心の位置と縦横比がお手本どおりか */
  balance(r, cfg) {
    const u = r.target.uv, t = r.target.tv;
    const v = Math.hypot(u.cx - t.cx, u.cy - t.cy) + Math.abs(Math.log(u.aspect / t.aspect)) * cfg.aspectWeight;
    return toScore(v, cfg.good, cfg.bad);
  },

  /* 線の安定感：線の太さのばらつき */
  stroke(r, cfg) {
    return r.strokeCv == null ? null : toScore(r.strokeCv, cfg.good, cfg.bad);
  },
};

/* 全項目を採点して合計を出す */
function scoreAll(r) {
  const metrics = CONFIG.metrics.map(cfg => {
    const fn = METRICS[cfg.key];
    if (!fn) throw new Error(`metrics.js に「${cfg.key}」の関数がありません`);
    const s = fn(r, cfg);
    return { ...cfg, score: s == null ? CONFIG.fallbackScore : s };
  });
  const wsum = metrics.reduce((s, m) => s + m.weight, 0) || 1;
  let total = Math.round(metrics.reduce((s, m) => s + m.score * m.weight, 0) / wsum);
  if (r.misread) total = Math.min(total, CONFIG.misreadCap);   // 別の字に読めたら上限あり
  return { metrics, total };
}

/* 形の距離 → 「似ている度」(%)。表示用 */
function similarity(d) {
  const cfg = CONFIG.metrics.find(m => m.key === 'shape');
  return Math.round(clamp(100 - 100 * (d - cfg.good) / (cfg.bad * 1.6 - cfg.good), 0, 100));
}
