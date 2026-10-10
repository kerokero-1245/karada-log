/**
 * 栄養値の計算（lib/nutrition.ts）の今の出力を固定する特性テスト。
 *
 * 未入力（null）を 0 として黙って足さない。足せなかった項目は数えて返す（原則 1）。
 * 値は架空のサンプル。丸めの境目は rounding.test.ts に並べてある。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_NUTRITION,
  fmtNum,
  scaleNutrition,
  sumNutrition,
} from "../src/lib/nutrition.ts";
import { nutrition } from "./helpers.ts";

test("nutrition.EMPTY_NUTRITION: 全部 null（未確認）。キーの順は kcal・P・脂質・炭水化物・塩分", () => {
  assert.deepEqual(EMPTY_NUTRITION, nutrition());
  assert.deepEqual(Object.keys(EMPTY_NUTRITION), [
    "kcal",
    "proteinG",
    "fatG",
    "carbG",
    "saltG",
  ]);
});

test("nutrition.scaleNutrition: 1 単位あたり × 数量。null は null のまま、元は書き換えない", () => {
  const per = nutrition({
    kcal: 118.6,
    proteinG: 21.7,
    carbG: 4.7,
    saltG: 0.11,
  });
  assert.deepEqual(scaleNutrition(per, 0.5), {
    kcal: 59.3,
    proteinG: 10.85,
    fatG: null,
    carbG: 2.35,
    saltG: 0.06,
  });
  assert.deepEqual(
    scaleNutrition(nutrition({ kcal: 100, proteinG: 0, saltG: 0.1 }), 0),
    {
      kcal: 0,
      proteinG: 0,
      fatG: null,
      carbG: null,
      saltG: 0,
    },
  );
  assert.deepEqual(
    per,
    nutrition({ kcal: 118.6, proteinG: 21.7, carbG: 4.7, saltG: 0.11 }),
  );
  assert.deepEqual(Object.keys(scaleNutrition(per, 1)), [
    "kcal",
    "proteinG",
    "fatG",
    "carbG",
    "saltG",
  ]);
});

test("nutrition.sumNutrition: null は足さずに、項目ごとの件数を unknown に数える", () => {
  const total = sumNutrition([
    nutrition({ kcal: 0.004, fatG: 1, saltG: 0.1 }),
    nutrition({ kcal: 0.004, proteinG: 2, saltG: 0.2 }),
    nutrition({ kcal: 0.004, saltG: 0.3 }),
  ]);
  assert.deepEqual(total, {
    value: { kcal: 0, proteinG: 2, fatG: 1, carbG: 0, saltG: 0.6 },
    unknown: { kcal: 0, proteinG: 2, fatG: 2, carbG: 3, saltG: 0 },
  });
  assert.deepEqual(Object.keys(total), ["value", "unknown"]);
});

test("nutrition.sumNutrition: 空の合計は全部 0（未確認の件数も 0）", () => {
  assert.deepEqual(sumNutrition([]), {
    value: { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, saltG: 0 },
    unknown: { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, saltG: 0 },
  });
});

test("nutrition.fmtNum: 小数第 2 位で丸めて接尾辞を付ける。null・NaN は —", () => {
  assert.equal(fmtNum(84.85, "g"), "84.85g");
  assert.equal(fmtNum(2.675), "2.68");
  assert.equal(fmtNum(null), "—");
  assert.equal(fmtNum(Number.NaN, "g"), "—");
});
