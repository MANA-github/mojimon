/* 共通の小さな関数 */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const cv = a => a.length < 2 ? 0 : std(a) / (mean(a) || 1);   // 変動係数（ばらつき）

// ばらつき値 v を点数に変換：good 以下で100点、bad 以上で CONFIG.minScore 点
const toScore = (v, good, bad) =>
  100 - (100 - CONFIG.minScore) * clamp((v - good) / (bad - good), 0, 1);
