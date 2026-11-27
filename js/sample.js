/*
 * 動作確認用のサンプル画像を作る
 * 各サンプル: { label: ボタン名, target: 入力欄に入れる文字, draw: 実際に描く文字, wave: ゆがみの強さ }
 */
const SAMPLES = [
  { label: 'きれいな「わ」',        target: 'わ', draw: 'わ', wave: 0 },
  { label: 'くずれた「わ」',        target: 'わ', draw: 'わ', wave: 14 },
  { label: '「れ」に見える「わ」',  target: 'わ', draw: 'れ', wave: 4 },
];

function makeSample({ draw, wave }) {
  const S = 480, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, S, S);

  // いったん別キャンバスに文字を描く
  const t = document.createElement('canvas'); t.width = t.height = S;
  const tg = t.getContext('2d');
  tg.fillStyle = '#222'; tg.textAlign = 'center'; tg.textBaseline = 'middle';
  tg.font = '600 300px "Meiryo", "Hiragino Maru Gothic ProN", sans-serif';
  tg.translate(S / 2, S / 2); tg.rotate(0.05); tg.fillText(draw, 0, 0);

  // 行ごとに左右へずらして手書きっぽいゆがみを付ける
  for (let y = 0; y < S; y += 2) {
    const dx = wave * Math.sin(y / 38) + wave * .6 * Math.sin(y / 13);
    g.drawImage(t, 0, y, S, 2, dx, y, S, 2);
  }
  return c;
}
