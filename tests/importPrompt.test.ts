/**
 * claude.ai（チャット）に貼る依頼文（lib/importPrompt.ts）の今の出力を固定する特性テスト。
 *
 * 依頼文は画面の「claude.ai 用の依頼文をコピー」でそのままクリップボードに入る。文面を 1 文字でも変えると
 * チャットの返し方が変わるので、全文を固定する。例文は、このアプリのパーサ（lib/quickText.ts・
 * lib/importText.ts）が全行を読めるものであること（例文を直すときの約束）も確かめる。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMPORT_PROMPT,
  IMPORT_PROMPT_EXAMPLE,
} from "../src/lib/importPrompt.ts";
import { parseImport } from "../src/lib/importText.ts";

test("importPrompt: 依頼文の全文", () => {
  assert.equal(
    IMPORT_PROMPT,
    [
      "この写真（またはこの説明）の食事を、次の形式だけで出してください。説明文は不要です。",
      "",
      "形式: 1行に1品目。「時刻 品目名 数量単位=kcal/たんぱく質/脂質/炭水化物/塩分」",
      "- 数値はその行の数量ぶんの合計。単位は g。分からない値は「-」",
      "- 複数の日があるときは、日付だけの行（例: 2026/09/22）で区切る",
      "- 時刻は24時間表記。分からなければ省略",
      "- 品目名は日常の呼び名（例: ご飯、焼き鮭、味付ゆで玉子）",
      "",
      "例:",
      "2026/09/22",
      "12:30 ご飯 1杯=252/3.8/0.5/55.7/0",
      "12:30 焼き鮭 1切れ=133/22/4.5/0.1/0.8",
      "21:00 味付ゆで玉子 2個=130/11.6/8.6/-/1.2",
      "",
    ].join("\n"),
  );
  assert.ok(IMPORT_PROMPT.endsWith(`${IMPORT_PROMPT_EXAMPLE}\n`));
});

test("importPrompt: 例文は日付行 1 行 + 品目 3 行で、全行を（食品マスタが空でも）値つきの推定として読める", () => {
  assert.deepEqual(IMPORT_PROMPT_EXAMPLE.split("\n"), [
    "2026/09/22",
    "12:30 ご飯 1杯=252/3.8/0.5/55.7/0",
    "12:30 焼き鮭 1切れ=133/22/4.5/0.1/0.8",
    "21:00 味付ゆで玉子 2個=130/11.6/8.6/-/1.2",
  ]);
  const parsed = parseImport(IMPORT_PROMPT_EXAMPLE, [], "2026-09-23");
  assert.equal(parsed.usedToday, false);
  assert.deepEqual(
    parsed.days.map((day) => day.logDate),
    ["2026-09-22"],
  );
  assert.deepEqual(
    parsed.rows.map((row) => [
      row.resolution.parsed.name,
      row.resolution.status,
      row.time,
    ]),
    [
      ["ご飯", "estimated", "12:30"],
      ["焼き鮭", "estimated", "12:30"],
      ["味付ゆで玉子", "estimated", "21:00"],
    ],
  );
});
