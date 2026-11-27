/*
 * 動作確認用のサンプル画像を作る
 * messy = true でわざと大きさ・位置・角度をばらつかせる
 */
const SAMPLE_LINES = ['きれいな文字を', '書きましょう'];

function makeSample(messy) {
  const c = document.createElement('canvas'); c.width = 1100; c.height = 420;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#222'; g.textBaseline = 'middle';
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280 - .5;   // 毎回同じ乱数
  SAMPLE_LINES.forEach((t, li) => {
    let x = 80;
    [...t].forEach(ch => {
      const s = messy ? 86 * (1 + rnd() * .7) : 86;
      const y = 120 + li * 170 + (messy ? rnd() * 60 + x * .04 : 0);
      g.save(); g.translate(x, y); if (messy) g.rotate(rnd() * .5);
      g.font = `${messy && rnd() > 0 ? 700 : 500} ${s}px "Yu Mincho","Hiragino Mincho ProN",serif`;
      g.fillText(ch, 0, 0); g.restore();
      x += messy ? s * (1.05 + rnd() * .9) : 100;
    });
  });
  return c;
}
