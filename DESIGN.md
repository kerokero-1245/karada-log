# karada-log の設計方針

食事とトレーニングを記録する個人用の PWA。この文書には、作り方の規則（全文は次の節のリンク先）のうちこのリポジトリで違うことと固有の約束、変えてはいけない境界、数字の整形の決まりを書く。

## この repo での適用

規則の全文は [作り方の規則](https://github.com/kerokero-1245/kerokero-1245/blob/main/DESIGN.md) にあります。ここには、このリポジトリで違うことだけを書きます。

### 例外（規則と違うこと）

- **CI の型の検査はテストの後**: 型の検査だけの段は無く、`npm run build`（`tsc -b && vite build`）の `tsc -b` が担うので、CI（`.github/workflows/deploy.yml`）では 整形の検査 → lint → テスト → 型の検査とビルド の順に回る。`tsc -b` は出力を書かない（`noEmit`）ビルドの前段で、テストは Node の型除去で型を見ずに動くため、型の誤りはテストの後のビルドの段で落ちる。

### 固有の約束（このリポジトリだけの不変条件）

- **純関数は DB と React を触らない**: 計算・整形・解釈は純関数にして、`tests/` で `node --test` する。DB を読み書きする処理は別のファイルに分けて（食品の追加は `src/db/foods.ts`、画面が読む問い合わせは `src/lib/queries.ts`）、純関数のテストが DB なしで回るようにする。
- **テスト**: 書き出しもテストの対象にする。
- **失敗の表示**: 利用者に読ませる本文は固定の日本語にする（`lib/errors.ts` の `failureText`。例: 「保存できませんでした。もう一度お試しください。」）。例外のメッセージ（`errorMessage`）は本文に混ぜず、`components/ui.tsx` の `ErrorText`・`ErrorDetail` で末尾に小さく添える。写真の読み取り（Claude API）の失敗だけ、`photoErrorMessage` で日本語に直した文を本文にする。
- **体組成（F5）**: 機種が違う測定は同じグラフに並べない（`lib/bodyComposition.ts` の `groupByDevice` で機種ごとに分ける）。グラフの主役は体重ではなく脂肪量と除脂肪量で、目標ラインは設定の `goal` から取る（数値を画面に直書きしない）。測定条件は「前日のトレの有無」ではなく「最後のトレからの日数」で持ち、同じ日のトレは測定時刻より前のものだけを数える（時刻で比べる。`lib/measurement.ts`）。`measurementMinRestDays` 日未満などの悪い条件でも記録は止めず、白抜きの点と「⚠ 条件が悪い」で区別する。推移グラフの描画はトレと共通の `components/TrendChart.tsx` を使う。
- 変えてはいけない保存の形と書き出しの形は [守る境界（変えない）](#守る境界変えない)、数字の桁と丸めは [数値の整形と丸め](#数値の整形と丸め) にまとめてある。

### 記録の例

- なし

## 守る境界（変えない）

- IndexedDB: DB 名 `"karada-log"`、`db.version(1)` と `db.version(2)` の stores 文字列と upgrade 処理。
- 保存データ: Food・MealEntry・PendingText・ShortcutSet・DayMeta・TrainingSession・SessionExercise・SetRecord・BodyComposition・BoneDensity・Settings のプロパティ名と、新規作成時のキーの順（JSON バックアップの行のキー順になる）。
- Markdown の書き出し（`buildMarkdown` の出力とファイル名 `karada-log-YYYYMMDD-YYYYMMDD.md`）と、JSON バックアップ（`app` / `formatVersion` / `exportedAt` / `seedVersion` / `tables`。設定から API キーを除く）。
- localStorage のキー `"karada-log.firstRunGuide"` と値 `"dismissed"`。
- Claude API への要求の形（`src/lib/vision.ts` のモデル・max_tokens・effort・fallbacks と beta・system 文・schema）。モデルを変えるのは `VISION_MODEL` とそのテストの期待値だけ。

## 数値の整形と丸め

丸めの方式は **Math.round 系の 1 つだけ**（`src/lib/number.ts`）。`toFixed` は使わない（2 進数の誤差で `Math.round` と食い違うため）。負のゼロ（-0）は 0 にする。

桁は栄養素ごとに 1 つ:

- **kcal**: 行は小数第 1 位（`fmtKcalItem`）、合計と進捗バー・目標は整数（`fmtKcal`）。どちらも桁区切りあり（`ja-JP`）。
- **たんぱく質・脂質・炭水化物・塩分（g）**: 小数第 2 位で丸めた値をそのまま文字列にする（`formatNumber` / `fmtNum`）。行・合計・進捗バー・Markdown の書き出しで同じ桁。合計（`sumNutrition`）は 1 件足すごとに小数第 2 位で丸めるので、行に出た値を足すと合計の表示になる（`tests/displaySums.test.ts`）。
- **kg・数量・回数**: 小数第 2 位で丸めた値をそのまま（`formatNumber`）。体組成の kg と % の書き出しは小数第 1 位（`formatNumber(value, 1)`）。

| 関数                                       | 置き場                                                            | 役割                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `roundTo(n, digits)` / `round2` / `round3` | `lib/number.ts`                                                   | 丸め（計算・保存側）。`round2` は栄養値の掛け算・足し算・重量・数量、`round3` は 1 単位あたりの値 |
| `addRounded(a, b)`                         | `lib/number.ts`                                                   | `a + b` を `round2` する。重量の加算・合計の足し込み                                              |
| `formatNumber(n, digits = 2)`              | `lib/number.ts`                                                   | 丸めた値をそのまま文字列にする。末尾の 0 は付かない（`1.50` → `'1.5'`）                           |
| `formatFixed(n, digits)`                   | `lib/number.ts`                                                   | 桁をそろえて文字列にする（`2` → `'2.0'`）。符号つきの差（`+2.0kg`）とグラフの座標だけ             |
| `fmtKcal` / `fmtKcalItem`                  | `lib/formatKcal.ts`                                               | kcal の合計（整数）/ 1 品（小数第 1 位）。どちらも桁区切り                                        |
| `fmtNum(v, suffix)`                        | `lib/nutrition.ts`                                                | g 系の値の表示。未確認（null）は `UNKNOWN_MARK`                                                   |
| `formatAmount(key, value)`                 | `lib/goals.ts`                                                    | 進捗バーの値。kcal は `fmtKcal`、ほかは `formatNumber`                                            |
| `formatQuantity`                           | `lib/mealView.ts`                                                 | 数量の表示（`formatNumber`）                                                                      |
| `fmtStored`                                | `lib/format.ts`                                                   | 保存されている値をそのまま出す（開発用のデータ確認・設定の目標値）                                |
| `UNKNOWN_MARK`                             | `lib/format.ts`                                                   | 未確認の印（`—`）。画面にも書き出しにもこの 1 つを使う                                            |
| `NutritionLine`                            | `components/NutritionLine.tsx`（文字列は `lib/nutritionLine.ts`） | 栄養値の 1 行表示。上の関数の組み合わせ（kcal の桁・g の桁）を props で選ぶ                       |

新しく数字を出すときは、新しい整形を書かずに上の関数を使う。足りない桁が出てきたら、`lib/number.ts` に足して、この表も直す。
