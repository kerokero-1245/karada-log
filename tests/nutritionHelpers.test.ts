/**
 * 栄養値の小さな道具（lib/nutrition.ts の mapNutrition・emptyNutrition・divideNutrition・hasUnknownCore・
 * plannedNutrition・plannedTotal）。
 *
 * 5 つの栄養値の手書きのマッピング・「どれかが未確認」の判定・固定ベースの計画値の合計を 1 か所にする。
 * 値は架空のサンプル。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  divideNutrition,
  emptyNutrition,
  hasUnknownCore,
  mapNutrition,
  plannedNutrition,
  plannedTotal,
  scaleNutrition,
  sumNutrition,
} from "../src/lib/nutrition.ts";
import { foodFixture, nutrition } from "./helpers.ts";

test("nutrition.mapNutrition: キーごとに fn を呼び、kcal・P・脂質・炭水化物・塩分の順に並べる", () => {
  const calls: string[] = [];
  const result = mapNutrition((key) => {
    calls.push(key);
    return key.length;
  });
  assert.deepEqual(calls, ["kcal", "proteinG", "fatG", "carbG", "saltG"]);
  assert.deepEqual(Object.keys(result), calls);
  assert.deepEqual(result, {
    kcal: 4,
    proteinG: 8,
    fatG: 4,
    carbG: 5,
    saltG: 5,
  });
});

test("nutrition.emptyNutrition: すべて null（未確認）。毎回新しいオブジェクト", () => {
  assert.deepEqual(emptyNutrition(), nutrition());
  assert.notEqual(emptyNutrition(), emptyNutrition());
  const changed = emptyNutrition();
  changed.kcal = 1;
  assert.equal(emptyNutrition().kcal, null);
});

test("nutrition.divideNutrition: 数量で割って 1 単位あたり（小数第 3 位）。null は null のまま", () => {
  assert.deepEqual(
    divideNutrition(
      nutrition({ kcal: 266, proteinG: 44, fatG: 9, carbG: 0.2, saltG: 1.6 }),
      2,
    ),
    { kcal: 133, proteinG: 22, fatG: 4.5, carbG: 0.1, saltG: 0.8 },
  );
  assert.deepEqual(divideNutrition(nutrition({ kcal: 100, proteinG: 10 }), 3), {
    kcal: 33.333,
    proteinG: 3.333,
    fatG: null,
    carbG: null,
    saltG: null,
  });
});

test("nutrition.divideNutrition と scaleNutrition: 割ってから掛けると（丸めの範囲で）元に戻る", () => {
  const whole = nutrition({
    kcal: 300,
    proteinG: 12,
    fatG: 6,
    carbG: 40,
    saltG: 1.5,
  });
  assert.deepEqual(scaleNutrition(divideNutrition(whole, 4), 4), whole);
});

test("nutrition.hasUnknownCore: kcal・たんぱく質・脂質・塩分のどれかが null なら true。炭水化物は見ない", () => {
  const known = { kcal: 1, proteinG: 1, fatG: 1, carbG: 1, saltG: 1 };
  assert.equal(hasUnknownCore(known), false);
  assert.equal(hasUnknownCore({ ...known, carbG: null }), false);
  assert.equal(hasUnknownCore({ ...known, kcal: null }), true);
  assert.equal(hasUnknownCore({ ...known, proteinG: null }), true);
  assert.equal(hasUnknownCore({ ...known, fatG: null }), true);
  assert.equal(hasUnknownCore({ ...known, saltG: null }), true);
  assert.equal(hasUnknownCore(emptyNutrition()), true);
  assert.equal(hasUnknownCore({ ...known, kcal: 0 }), false);
});

test("nutrition.plannedNutrition / plannedTotal: 固定ベース（計画）の 1 品と合計。食品が無い品目は 0 で埋めず、合計から外す", () => {
  const egg = foodFixture({
    id: 1,
    per: nutrition({ kcal: 65, proteinG: 5.8, fatG: 4.3, saltG: 0.6 }),
  });
  const protein = foodFixture({
    id: 2,
    per: nutrition({
      kcal: 118.5,
      proteinG: 21.7,
      fatG: 1.8,
      carbG: 4.7,
      saltG: 0.11,
    }),
  });

  assert.deepEqual(plannedNutrition(egg, 2), scaleNutrition(egg.per, 2));
  assert.equal(plannedNutrition(undefined, 2), null);

  const values = [
    plannedNutrition(egg, 2),
    plannedNutrition(undefined, 1),
    plannedNutrition(protein, 1.5),
  ];
  const total = plannedTotal(values);
  assert.deepEqual(
    total,
    sumNutrition([
      scaleNutrition(egg.per, 2),
      scaleNutrition(protein.per, 1.5),
    ]),
  );
  assert.deepEqual(total.value, {
    kcal: 307.75,
    proteinG: 44.15,
    fatG: 11.3,
    carbG: 7.05,
    saltG: 1.37,
  });
  assert.deepEqual(plannedTotal([]).value, {
    kcal: 0,
    proteinG: 0,
    fatG: 0,
    carbG: 0,
    saltG: 0,
  });
});
