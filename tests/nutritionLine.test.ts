/**
 * 栄養値の 1 行表示（lib/nutritionLine.ts）。
 *
 * 一覧・合計・プレビュー・開発用の確認の 17 か所が、同じ関数の桁の選び方（kcal / grams / unit / carb / salt）だけで
 * 今までと同じ文字列になること。画面の部品（components/NutritionLine.tsx）はこの文字列を出すだけ。
 * 値は架空のサンプル。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { nutritionLineText } from "../src/lib/nutritionLine.ts";
import { nutrition } from "./helpers.ts";

const VALUE = nutrition({
  kcal: 1234.56,
  proteinG: 2.675,
  fatG: 0.15,
  carbG: 4.345,
  saltG: 0.055,
});

test("nutritionLineText: 既定は 1 品の行（kcal は小数第 1 位・g は小数第 2 位の丸め値）", () => {
  assert.equal(
    nutritionLineText(VALUE),
    "1,234.6kcal / P2.68g / 脂質0.15g / 塩分0.06g",
  );
});

test("nutritionLineText: kcal=total は整数（合計・計画の合計）", () => {
  assert.equal(
    nutritionLineText(VALUE, { kcal: "total" }),
    "1,235kcal / P2.68g / 脂質0.15g / 塩分0.06g",
  );
});

test("nutritionLineText: 保存値のまま（開発用。kcal も g も丸めない）", () => {
  assert.equal(
    nutritionLineText(VALUE, { kcal: "stored", grams: "stored" }),
    "1,234.56kcal / P2.675g / 脂質0.15g / 塩分0.055g",
  );
});

test("nutritionLineText: unit=false は g を付けない（開発用の固定ベースの行）", () => {
  assert.equal(
    nutritionLineText(VALUE, { kcal: "stored", unit: false }),
    "1,234.56kcal / P2.68 / 脂質0.15 / 塩分0.06",
  );
});

test("nutritionLineText: carb は炭水化物を脂質と塩分の間に出す（開発用の食品マスタの行）", () => {
  assert.equal(
    nutritionLineText(VALUE, { kcal: "stored", grams: "stored", carb: true }),
    "1,234.56kcal / P2.675g / 脂質0.15g / 炭水4.345g / 塩分0.055g",
  );
});

test("nutritionLineText: salt=false は塩分を出さない（食べ方の選択。塩分は別に大きく出す）", () => {
  assert.equal(
    nutritionLineText(VALUE, { salt: false }),
    "1,234.6kcal / P2.68g / 脂質0.15g",
  );
});

test("nutritionLineText: 未確認（null）は — を出す。0 で埋めない", () => {
  assert.equal(
    nutritionLineText(nutrition({ kcal: 100, proteinG: 3 })),
    "100kcal / P3g / 脂質—g / 塩分—g",
  );
  assert.equal(
    nutritionLineText(nutrition(), { kcal: "total" }),
    "—kcal / P—g / 脂質—g / 塩分—g",
  );
  assert.equal(
    nutritionLineText(nutrition(), { kcal: "stored", unit: false }),
    "—kcal / P— / 脂質— / 塩分—",
  );
});

test("nutritionLineText: 負のゼロは 0 と出す（'-0' にしない）", () => {
  assert.equal(
    nutritionLineText(
      nutrition({ kcal: -0, proteinG: -0.004, fatG: 0, saltG: 0 }),
    ),
    "0kcal / P0g / 脂質0g / 塩分0g",
  );
});
