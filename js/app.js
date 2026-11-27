/*
 * 画面の操作と結果表示
 */

/* ---------- 文言を設定から反映 ---------- */
$('appName').innerHTML = CONFIG.text.appName;
$('lead').textContent = CONFIG.text.lead;
const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');

/* ---------- 入力 ---------- */
let lastSource = null;   // 最後に読み込んだ画像（文字を入れ直したら再採点する）
const targetInput = $('target');
const getTarget = () => [...targetInput.value.trim()][0] || '';

targetInput.addEventListener('input', () => {
  const t = getTarget();
  if (targetInput.value.trim() !== t) targetInput.value = t;   // 1文字に制限
  if (t && lastSource) runSoon();
});

const drop = $('drop'), file = $('file');
drop.onclick = () => file.click();
drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') file.click(); };
file.onchange = () => { if (file.files[0]) loadFile(file.files[0]); file.value = ''; };
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
document.addEventListener('paste', e => {
  const it = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
  if (it) loadFile(it.getAsFile());
});

// サンプルボタン
$('samples').innerHTML = SAMPLES.map((s, i) => `<button data-i="${i}">${s.label}</button>`).join('');
$('samples').onclick = e => {
  const s = SAMPLES[e.target.dataset.i]; if (!s) return;
  targetInput.value = s.target;
  const c = makeSample(s);
  setSource(c, c.width, c.height);
};

function loadFile(f) {
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.onload = () => setSource(img, img.naturalWidth, img.naturalHeight);
  img.onerror = () => showError(CONFIG.text.loadError);
  img.src = url;
}

function setSource(src, w, h) {
  lastSource = { src, w, h };
  if (!getTarget()) { showError(CONFIG.text.needTarget); targetInput.focus(); return; }
  runSoon();
}

function showError(msg) {
  const e = $('err'); e.textContent = msg; e.style.display = 'block';
  $('result').style.display = 'none';
}

/* ---------- 解析の実行 ---------- */
function runSoon() {
  $('err').style.display = 'none';
  $('busy').style.display = 'block';
  setTimeout(() => { run(); $('busy').style.display = 'none'; }, 30);   // 「解析中」を先に表示させる
}

function run() {
  const { src, w: w0, h: h0 } = lastSource, target = getTarget();
  const max = CONFIG.detect.maxImageSize, sc = Math.min(1, max / Math.max(w0, h0));
  const W = Math.round(w0 * sc), H = Math.round(h0 * sc);
  const cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H;
  const g = cvs.getContext('2d'); g.drawImage(src, 0, 0, W, H);
  try {
    const crop = extractChar(g.getImageData(0, 0, W, H).data, W, H);
    const r = judgeChar(crop, target);
    render(crop, r, scoreAll(r), cvs, target);
  } catch (e) {
    console.error(e);
    showError(e.message || '解析に失敗しました。');
  }
}

/* ---------- 結果表示 ---------- */
const colorVar = s => s >= CONFIG.colorThresholds.good ? '--good' : s >= CONFIG.colorThresholds.mid ? '--mid' : '--bad';
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function render(crop, r, { metrics, total }, src, target) {
  $('result').style.display = 'block';

  // 総合点とランク
  const rk = CONFIG.ranks.find(x => total >= x.min) || CONFIG.ranks[CONFIG.ranks.length - 1];
  $('rank').textContent = rk.rank + 'ランク';
  $('rank').style.background = `var(${colorVar(total)})`;
  $('title').textContent = rk.title;
  $('summary').textContent = rk.message;
  const arc = $('arc'), len = 2 * Math.PI * 72;
  arc.style.stroke = `var(${colorVar(total)})`;
  arc.style.strokeDasharray = len;
  arc.style.strokeDashoffset = len;
  requestAnimationFrame(() => requestAnimationFrame(() => arc.style.strokeDashoffset = len * (1 - total / 100)));
  countUp($('score'), total);

  // 読み取り結果
  const o = { target, rival: r.rival?.ch, cap: CONFIG.misreadCap };
  const rd = $('reading');
  rd.className = 'reading ' + (r.misread ? 'ng' : 'ok');
  rd.innerHTML = `<b>${fmt(r.misread ? CONFIG.text.readNg : CONFIG.text.readOk, o)}</b>` +
    (r.misread ? `<p>${fmt(CONFIG.text.readNgDetail, o)}</p>` : '') +
    (crop.multiple ? `<p>${CONFIG.text.multiple}</p>` : '') +
    `<div class="cands"><span>形が近い文字：</span>${r.ranking.slice(0, CONFIG.showCandidates).map(m =>
      `<span class="chip${m.ch === target ? ' me' : ''}">${m.ch}<small>${similarity(m.d)}%</small></span>`).join('')}</div>`;

  // 項目ごとのバー
  $('metrics').innerHTML = metrics.map(m => `
    <div class="m">
      <div class="lab"><span>${m.name}<em>${m.desc}</em></span><b>${Math.round(m.score)}点</b></div>
      <div class="bar"><i style="background:var(${colorVar(m.score)})" data-w="${m.score}"></i></div>
    </div>`).join('');
  requestAnimationFrame(() => document.querySelectorAll('.bar i').forEach(i => i.style.width = i.dataset.w + '%'));

  // アドバイス
  const best = [...metrics].sort((a, b) => b.score - a.score)[0];
  const weak = [...metrics].sort((a, b) => a.score - b.score)
    .filter(m => m.score < CONFIG.tipThreshold).slice(0, CONFIG.maxTips);
  $('advice').innerHTML = `<b>${CONFIG.text.bestLabel}</b>${best.name}（${Math.round(best.score)}点）` +
    (weak.length
      ? `<br><b>${CONFIG.text.tipsLabel}</b><ul>${weak.map(m => `<li><b>${m.name}</b>：${m.tip}</li>`).join('')}</ul>`
      : `<br>${CONFIG.text.allGood}`);

  drawCompare(crop, r, src, target);
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* お手本との見比べ：あなたの字 / お手本 / 重ね合わせ */
function drawCompare(crop, r, src, target) {
  const S = 240, pad = 20;
  const prep = id => {
    const c = $(id); c.width = c.height = S;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#e6e2da'; g.setLineDash([4, 4]); g.lineWidth = 1;   // 十字のガイド線
    g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
    g.setLineDash([]);
    return g;
  };

  // あなたの字（写真から切り出し）
  let g = prep('cvUser');
  const m = Math.max(crop.w, crop.h) * .08, sz = Math.max(crop.w, crop.h) + m * 2;
  const sx = crop.x0 + crop.w / 2 - sz / 2, sy = crop.y0 + crop.h / 2 - sz / 2;
  g.drawImage(src, sx, sy, sz, sz, 0, 0, S, S);

  // お手本（いちばん近かったフォントで描く）
  g = prep('cvModel');
  g.fillStyle = '#222'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${S * .72}px ${r.target.tv.font}`;
  g.fillText(target, S / 2, S / 2);

  // 重ね合わせ（どちらも同じ大きさにそろえたもの）
  g = prep('cvOverlay');
  const G = CONFIG.match.grid, cell = (S - pad * 2) / G;
  const paint = (grid, color) => {
    g.fillStyle = color;
    for (let i = 0; i < G * G; i++) if (grid[i]) g.fillRect(pad + (i % G) * cell, pad + ((i / G) | 0) * cell, cell + .5, cell + .5);
  };
  paint(r.target.tv.grid, 'rgba(47,111,222,.35)');
  paint(r.target.uv.grid, 'rgba(217,83,79,.75)');

  // 写真全体（どこを文字として見たか）
  const v = $('view'); v.width = src.width; v.height = src.height;
  const vg = v.getContext('2d'); vg.drawImage(src, 0, 0);
  const lw = Math.max(2, src.width / 300);
  vg.lineWidth = lw; vg.strokeStyle = cssVar('--accent');
  vg.strokeRect(crop.x0 - lw * 2, crop.y0 - lw * 2, crop.w + lw * 4, crop.h + lw * 4);
}

/* ページを開いたら、比較用のお手本を少しずつ裏で作っておく（初回の採点を速くするため） */
(function warmUp() {
  const chars = [...CONFIG.match.candidates];
  let i = 0;
  const step = () => {
    const end = Math.min(chars.length, i + 15);
    for (; i < end; i++) getTemplates(chars[i]);
    if (i < chars.length) setTimeout(step, 0);
  };
  setTimeout(step, 300);
})();

function countUp(el, to) {
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / 900);
    el.textContent = Math.round(to * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
