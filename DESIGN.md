# karada-log の設計方針

食事とトレーニングを記録する個人用の PWA。この文書は、コードを直すときに守る方針と、変えてはいけない境界、数字の整形の決まりを 1 か所にまとめたもの。

## コーディング方針

- **共通化は 3 回から**: 同じ意味の値・処理が 3 回以上出てきたら 1 か所へ寄せる（2 回までは無理に寄せない）。リポジトリをまたぐ共通化はしない。
- **純関数は DB と React を触らない**: 計算・整形・解釈は純関数にして、`tests/` で `node --test` する。DB を読み書きする処理は別のファイルに分けて、純関数のテストが DB なしで回るようにする。
- **テスト**: 純関数と書き出しは必ずテストを書く。画面の見た目を変えない直しは、前後で撮影して全画素を比べる。
- **整形**: Prettier の既定設定。`npm run format` で整形、`npm run format:check` で検査する。CI は format:check → lint → test → build の順に回す。
- **直すときは「挙動と見た目を変えない」**: 変える場合は理由を書いて、別のコミットにする。

## 守る境界（変えない）

- IndexedDB: DB 名 `"karada-log"`、`db.version(1)` と `db.version(2)` の stores 文字列と upgrade 処理。
- 保存データ: Food・MealEntry・PendingText・ShortcutSet・DayMeta・TrainingSession・SessionExercise・SetRecord・Settings のプロパティ名と、新規作成時のキーの順（JSON バックアップの行のキー順になる）。
- Markdown の書き出し（`buildMarkdown` の出力とファイル名 `karada-log-YYYYMMDD-YYYYMMDD.md`）と、JSON バックアップ（`app` / `formatVersion` / `exportedAt` / `seedVersion` / `tables`。設定から API キーを除く）。
- localStorage のキー `"karada-log.firstRunGuide"` と値 `"dismissed"`。
- Claude API への要求の形（`src/lib/vision.ts` のモデル・max_tokens・effort・fallbacks と beta・system 文・schema）。モデルを変えるのは `VISION_MODEL` とそのテストの期待値だけ。

## 数値の整形と丸め

丸めの方式は **Math.round 系の 1 つだけ**（`src/lib/number.ts`）。`toFixed` は使わない（2 進数の誤差で `Math.round` と食い違うため）。負のゼロ（-0）は 0 にする。

桁は栄養素ごとに 1 つ:

- **kcal**: 行は小数第 1 位（`fmtKcalItem`）、合計と進捗バー・目標は整数（`fmtKcal`）。どちらも桁区切りあり（`ja-JP`）。
- **たんぱく質・脂質・炭水化物・塩分（g）**: 小数第 2 位で丸めた値をそのまま文字列にする（`formatNumber` / `fmtNum`）。行・合計・進捗バー・Markdown の書き出しで同じ桁。合計（`sumNutrition`）は 1 件足すごとに小数第 2 位で丸めるので、行に出た値を足すと合計の表示になる（`tests/displaySums.test.ts`）。
- **kg・数量・回数**: 小数第 2 位で丸めた値をそのまま（`formatNumber`）。体組成の kg と % の書き出しは小数第 1 位（`formatNumber(value, 1)`）。

| 関数                                       | 置き場              | 役割                                                                                              |
| ------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------- |
| `roundTo(n, digits)` / `round2` / `round3` | `lib/number.ts`     | 丸め（計算・保存側）。`round2` は栄養値の掛け算・足し算・重量・数量、`round3` は 1 単位あたりの値 |
| `addRounded(a, b)`                         | `lib/number.ts`     | `a + b` を `round2` する。重量の加算・合計の足し込み                                              |
| `formatNumber(n, digits = 2)`              | `lib/number.ts`     | 丸めた値をそのまま文字列にする。末尾の 0 は付かない（`1.50` → `'1.5'`）                           |
| `formatFixed(n, digits)`                   | `lib/number.ts`     | 桁をそろえて文字列にする（`2` → `'2.0'`）。符号つきの差（`+2.0kg`）とグラフの座標だけ             |
| `fmtKcal` / `fmtKcalItem`                  | `lib/formatKcal.ts` | kcal の合計（整数）/ 1 品（小数第 1 位）。どちらも桁区切り                                        |
| `fmtNum(v, suffix)`                        | `lib/nutrition.ts`  | g 系の値の表示。未確認（null）は `UNKNOWN_MARK`                                                   |
| `formatAmount(key, value)`                 | `lib/goals.ts`      | 進捗バーの値。kcal は `fmtKcal`、ほかは `formatNumber`                                            |
| `formatQuantity`                           | `lib/mealView.ts`   | 数量の表示（`formatNumber`）                                                                      |
| `fmtStored`                                | `lib/format.ts`     | 保存されている値をそのまま出す（開発用のデータ確認・設定の目標値）                                |
| `UNKNOWN_MARK`                             | `lib/format.ts`     | 未確認の印（`—`）。画面にも書き出しにもこの 1 つを使う                                            |

新しく数字を出すときは、新しい整形を書かずに上の関数を使う。足りない桁が出てきたら、`lib/number.ts` に足して、この表も直す。
