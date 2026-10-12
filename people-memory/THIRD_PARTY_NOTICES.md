# サードパーティ・モデルの利用条件メモ

> 本ファイルは「確認できた事実」と「未確認事項」を分けて記録する（仕様 0章-8, 6.4）。
> ライブラリ本体の MIT 表記だけで、モデル等すべての利用条件が保証されたとは判断しない。
> 最終確認日: 2026-10-12

## 顔認識（`@vladmandic/human` 3.3.6）

| 対象 | 用途 | 確認できたこと | 未確認・要確認 |
|---|---|---|---|
| `@vladmandic/human` 本体 | 推論パイプライン | `node_modules/@vladmandic/human/LICENSE` は MIT | — |
| `blazeface.json/.bin` | 顔検出 | Human Wiki「Models」で出典が MediaPipe BlazeFace（Back）と記載。Wiki に「同梱モデルは元モデルのライセンスを継承」と記載 | MediaPipe 公式モデルカード上のライセンス・利用制限の個別確認 |
| `facemesh.json/.bin` | 顔の向き推定（品質チェック用） | Human Wiki で出典が MediaPipe FaceMesh と記載 | 同上 |
| `faceres.json/.bin` | 顔特徴量（embedding 128次元相当） | Human Wiki で出典が HSE-FaceRes（HSE-asavchenko/HSE_FaceRec_tf）と記載。同リポジトリ master ブランチの LICENSE は Apache License 2.0 | 学習データセット由来の利用制限（研究目的限定等）の有無。**商用化前に法務確認が必須** |
| TensorFlow.js（Human に同梱） | 推論ランタイム | Human の dist に同梱 | 同梱バージョンのライセンス表記の確認（Apache-2.0 の想定だが未確認） |

### 補足

- `faceres` モデルは内部的に年齢・性別も出力するが、本アプリは embedding 以外を読み取らず、保存・表示もしない（仕様 2.3 の属性推定禁止）。`emotion` 等の属性推定モデルは配信物にコピーしていない（`scripts/copy-models.mjs`）。
- モデルファイルはリポジトリに含めず、`npm install` 後に `npm run copy-models` で `node_modules` から `public/models/` にコピーし、自サイトから配信する（外部CDN不使用）。
- Human の既定 `wasmPath` は CDN を参照するため、WASM バックエンドは無効にしている（WebGL → CPU の順でフォールバック）。WASM を使う場合は `.wasm` ファイルを自サイトに置き、ライセンスを追記すること。

## その他の主要ライブラリ（ランタイム）

| パッケージ | バージョン | ライセンス（package.json 表記） |
|---|---|---|
| react / react-dom | 18.3.1 | MIT |
| react-router-dom | 6.30.6 | MIT |
| dexie | 4.0.11 | Apache-2.0 |
| papaparse | 5.4.1 | MIT |
| zustand | 5.0.3 | MIT |
| workbox-window（vite-plugin-pwa 経由） | 7.4.1 | MIT |
