# もじモン 文字きれい度チェッカー

手書き文字の写真をアップロードすると、文字のきれいさを100点満点で採点するサイトです。
サーバー不要で、`index.html` をブラウザで開くだけで動きます。画像はブラウザ内だけで処理します。

## ファイル構成

| ファイル | 役割 | よく触る？ |
|---|---|---|
| `index.html` | ページの骨組み（文言の一部・説明文） | ときどき |
| `css/style.css` | 見た目（色・レイアウト） | ★ |
| `js/config.js` | **採点の厳しさ・重み・ランク・メッセージ・解析の設定** | ★★★ |
| `js/metrics.js` | 採点項目の計算ロジック（項目の追加はここ） | ★ |
| `js/detector.js` | 画像から行・文字を切り出す処理 | まれ |
| `js/app.js` | アップロード操作と結果の表示 | まれ |
| `js/sample.js` | 「サンプルで試す」用の画像を作る | まれ |
| `js/utils.js` | 平均・ばらつきなどの共通関数 | まれ |

## カスタマイズ

### 採点を厳しく／甘くしたい
`js/config.js` の `metrics` にある各項目の `good` と `bad` を変えます。

- ばらつき値が `good` 以下なら **100点**、`bad` 以上なら **`minScore` 点**（初期値20）
- 両方を**小さく**すると厳しく、**大きく**すると甘くなります
- いちばん低い点を変えたいときは `minScore`

### 項目ごとの重みを変えたい
`metrics` の `weight`。合計が1になるようにしてください（ずれていても自動で割合に直します）。
項目を消したいときは、その `{ ... }` ごと消すだけです。

### ランクやメッセージを変えたい
`ranks` に、上から順に `min`（この点以上）・ランク名・タイトル・メッセージを書きます。
アドバイス文は各項目の `tip`、画面の文言は `text` にあります。

### 色を変えたい
`css/style.css` 冒頭の `:root` にある色を変えます（`--good` 緑 / `--mid` 黄 / `--bad` 赤 / `--accent2` 青）。
何点から緑・黄にするかは `config.js` の `colorThresholds`。

### 採点項目を追加したい
1. `js/metrics.js` の `METRICS` に関数を追加（`det` = 検出結果、`cfg` = 設定。0〜100の点数を返す。判定できないときは `null`）
2. `js/config.js` の `metrics` に同じ `key` で名前・重み・`good`/`bad`・`tip` を追加

例（文字の縦横比のばらつき）:
```js
// metrics.js
aspect(det, cfg) {
  const r = det.all.filter(c => !c.minor).map(c => c.w / c.h);
  return toScore(cv(r), cfg.good, cfg.bad);
},
```
```js
// config.js の metrics に追加
{ key: 'aspect', weight: 0.1, name: '形の揃い', desc: '縦横比が一定か',
  good: 0.08, bad: 0.4, tip: '文字の縦横の比率をそろえましょう。' },
```

`det.all` の各文字には次の値があります：
`x0, x1, y0, y1`（枠）, `w, h, size`（大きさ）, `cx, cy`（枠の中心）, `stroke`（線の太さ）, `bx, by`（重心のずれ）, `minor`（句読点など小さい文字）

### うまく文字が検出されないとき
`config.js` の `detect` を調整します。
- 薄い文字が拾えない → `inkMinDiff` を小さく、`inkRatio` を大きく（例: 12, 0.88）
- ゴミ・汚れを拾う → `minAreaRatio` を大きく
- 1文字が2つに分かれる → `narrowPart` を大きく、`charMergeGap` を大きく
- 2文字がくっつく → `maxCharWidth` を小さく
