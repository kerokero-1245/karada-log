/**
 * 栄養素の表示名（長い名前・短い名前）・並び・未確認の印（M-17・M-18）。
 *
 * 進捗バーの見出し・登録フォームの入力欄・エラー文・書き出しの表の見出し・内訳の見出しは、
 * db/types.ts の表と lib/format.ts の UNKNOWN_MARK から引く。文言を直書きしない。
 * 値は今までの画面・書き出しと同じ文字列（見た目と Markdown は変えない）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CORE_NUTRIENT_KEYS,
  NUTRIENT_DISPLAY_ORDER,
  NUTRIENT_KEYS,
  NUTRIENT_LABELS,
  NUTRIENT_NAMES,
} from "../src/db/types.ts";
import {
  buildFood,
  NUTRIENT_FIELDS,
  emptyFoodForm,
} from "../src/lib/foodForm.ts";
import { UNKNOWN_MARK, fmtStored } from "../src/lib/format.ts";
import { fmtKcal, fmtKcalItem } from "../src/lib/formatKcal.ts";
import { buildBars } from "../src/lib/goals.ts";
import { buildMarkdown } from "../src/lib/exportMarkdown.ts";
import { fmtNum, sumNutrition } from "../src/lib/nutrition.ts";
import { describeProgression } from "../src/lib/weight.ts";
import { richExportInput } from "./exportFixtures.ts";
import { nutrition, settingsFixture } from "./helpers.ts";

test("types: 栄養素の表示名は長い名前（カロリー・たんぱく質…）と短い名前（kcal・P…）の 2 つ", () => {
  assert.deepEqual(NUTRIENT_NAMES, {
    kcal: "カロリー",
    proteinG: "たんぱく質",
    fatG: "脂質",
    carbG: "炭水化物",
    saltG: "塩分",
  });
  assert.deepEqual(NUTRIENT_LABELS, {
    kcal: "kcal",
    proteinG: "P",
    fatG: "脂質",
    carbG: "炭水",
    saltG: "塩分",
  });
});

test("types: 未確認の判定・書き出し・進捗バーが見る 4 つと、内訳の並び（炭水化物は最後）", () => {
  assert.deepEqual(
    [...CORE_NUTRIENT_KEYS],
    ["kcal", "proteinG", "fatG", "saltG"],
  );
  assert.deepEqual(
    [...NUTRIENT_DISPLAY_ORDER],
    ["kcal", "proteinG", "fatG", "saltG", "carbG"],
  );
  assert.deepEqual(
    [...NUTRIENT_DISPLAY_ORDER].sort(),
    [...NUTRIENT_KEYS].sort(),
  );
});

test("進捗バーの見出し・登録フォームの入力欄とエラー文は NUTRIENT_NAMES と同じ", () => {
  const total = sumNutrition([
    nutrition({ kcal: 1, proteinG: 1, fatG: 1, saltG: 1 }),
  ]);
  const bars = buildBars(total, settingsFixture(), "rest");
  assert.deepEqual(
    bars.map((bar) => bar.label),
    ["kcal", "proteinG", "fatG", "saltG"].map(
      (key) => NUTRIENT_NAMES[key as keyof typeof NUTRIENT_NAMES],
    ),
  );

  assert.deepEqual(
    NUTRIENT_FIELDS.map((field) => [field.key, field.label, field.unit]),
    [
      ["kcal", "カロリー", "kcal"],
      ["proteinG", "たんぱく質", "g"],
      ["fatG", "脂質", "g"],
      ["carbG", "炭水化物", "g"],
      ["saltG", "塩分", "g"],
    ],
  );

  const bad = buildFood({
    ...emptyFoodForm("テスト"),
    kcal: "x",
    proteinG: "x",
    fatG: "x",
    carbG: "x",
    saltG: "x",
  });
  assert.deepEqual(bad.errors, [
    "カロリーは0以上の数値で入力してください",
    "たんぱく質は0以上の数値で入力してください",
    "脂質は0以上の数値で入力してください",
    "炭水化物は0以上の数値で入力してください",
    "塩分は0以上の数値で入力してください",
  ]);
});

test("書き出しの表の見出しは NUTRIENT_LABELS の kcal・P・脂質・塩分", () => {
  const markdown = buildMarkdown(richExportInput());
  assert.ok(
    markdown.includes(
      "| 日付 | 曜日 | 区分 | kcal | P | 脂質 | 塩分 | 未確認 | トレ |",
    ),
  );
  assert.ok(
    markdown.includes("| 時刻 | 品目 | 数量 | kcal | P | 脂質 | 塩分 | 備考 |"),
  );
  assert.ok(
    markdown.includes("たんぱく質 130g（上限 150g）、脂質 50g、塩分 7g以内"),
  );
});

test("UNKNOWN_MARK: 未確認（null）の印は '—' 1 つ。数値・kcal・保存値・重量の表示がどれもこの印を返す", () => {
  assert.equal(UNKNOWN_MARK, "—");
  assert.equal(fmtNum(null), UNKNOWN_MARK);
  assert.equal(fmtKcal(null), UNKNOWN_MARK);
  assert.equal(fmtKcalItem(null), UNKNOWN_MARK);
  assert.equal(fmtStored(null), UNKNOWN_MARK);
  assert.equal(describeProgression(null), UNKNOWN_MARK);
});
