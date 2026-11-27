/*
 * 画面の操作と結果表示
 */

/* ---------- 文言を設定から反映 ---------- */
$('appName').innerHTML = CONFIG.text.appName;
$('lead').textContent = CONFIG.text.lead;

/* ---------- 入力 ---------- */
const drop = $('drop'), file = $('file');
drop.onclick = () => file.click();
drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') file.click(); };
file.onchange = () => file.files[0] && loadFile(file.files[0]);
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
document.addEventListener('paste', e => {
  const it = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
  if (it) loadFile(it.getAsFile());
});
$('s1').onclick = () => { const c = makeSample(false); run(c, c.width, c.height); };
$('s2').onclick = () => { const c = makeSample(true); run(c, c.width, c.height); };

function loadFile(f) {
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.onload = () => { run(img, img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(url); };
  img.onerror = () => showError(CONFIG.text.loadError);
  img.src = url;
}

function showError(msg) {
  const e = $('err'); e.textContent = msg; e.style.display = 'block';
  $('result').style.display = 'none';
}

/* ---------- 解析の実行 ---------- */
function run(src, w0, h0) {
  $('err').style.display = 'none';
  const max = CONFIG.detect.maxImageSize, sc = Math.min(1, max / Math.max(w0, h0));
  const W = Math.round(w0 * sc), H = Math.round(h0 * sc);
  const cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H;
  const g = cvs.getContext('2d'); g.drawImage(src, 0, 0, W, H);
  try {
    const det = detectChars(g.getImageData(0, 0, W, H).data, W, H);
    const result = scoreAll(det);
    render(det, result, cvs);
  } catch (e) {
    console.error(e);
    showError(e.message || '解析に失敗しました。');
  }
}

/* ---------- 結果表示 ---------- */
const colorVar = s => s >= CONFIG.colorThresholds.good ? '--good' : s >= CONFIG.colorThresholds.mid ? '--mid' : '--bad';
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function render(det, { metrics, total }, src) {
  $('result').style.display = 'block';

  // 総合点とランク
  const rk = CONFIG.ranks.find(r => total >= r.min) || CONFIG.ranks[CONFIG.ranks.length - 1];
  $('rank').textContent = rk.rank + 'ランク';
  $('rank').style.background = `var(${colorVar(total)})`;
  $('title').textContent = rk.title;
  $('summary').textContent = `${rk.message}（検出した文字数：${det.all.length}文字 / ${det.lines.length}行）`;
  const arc = $('arc'), len = 2 * Math.PI * 72;
  arc.style.stroke = `var(${colorVar(total)})`;
  arc.style.strokeDasharray = len;
  arc.style.strokeDashoffset = len;
  requestAnimationFrame(() => requestAnimationFrame(() => arc.style.strokeDashoffset = len * (1 - total / 100)));
  countUp($('score'), total);

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

  drawOverlay(det, src);
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* 解析画像：文字の枠と行の傾きを描く */
function drawOverlay(det, src) {
  const v = $('view'); v.width = det.W; v.height = det.H;
  const g = v.getContext('2d'); g.drawImage(src, 0, 0);
  const lw = Math.max(2, det.W / 450), B = CONFIG.boxDeviation;
  g.lineWidth = lw;
  det.all.forEach(c => {
    g.strokeStyle = c.minor ? '#999' : cssVar(c.dev < B.good ? '--good' : c.dev < B.mid ? '--mid' : '--bad');
    g.strokeRect(c.x0 - lw, c.y0 - lw, c.w + lw * 2, c.h + lw * 2);
  });
  g.strokeStyle = cssVar('--accent2'); g.setLineDash([lw * 4, lw * 3]);
  det.lines.forEach(l => {
    if (!l.fit) return;
    const xa = l.chars[0].x0, xb = l.chars[l.chars.length - 1].x1;
    g.beginPath(); g.moveTo(xa, l.fit.a + l.fit.b * xa); g.lineTo(xb, l.fit.a + l.fit.b * xb); g.stroke();
  });
  g.setLineDash([]);
}

function countUp(el, to) {
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / 900);
    el.textContent = Math.round(to * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
