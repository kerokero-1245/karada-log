/**
 * 新規食品の登録フォームの正規化（lib/foodForm.ts）の今の出力を固定する特性テスト。
 *
 * 入力は「ラベルの表記そのまま」。保存時に 1 単位あたりへ換算して Food.per に入れ、元の表記は
 * Food.basis に残す。空欄は 0 ではなく null。新規作成した Food のキーの順は JSON バックアップの
 * 行のキー順になるので、Object.keys の順も確かめる。時刻は freezeTime で固定する。値は架空のサンプル。
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  BASIS_OPTIONS,
  NUTRIENT_FIELDS,
  buildFood,
  emptyFoodForm,
} from "../src/lib/foodForm.ts";
import type { FoodFormValues } from "../src/lib/foodForm.ts";
import { freezeTime, nutrition, unfreezeTime } from "./helpers.ts";

afterEach(() => unfreezeTime());

/** 100kcal / P10 / 脂質1 / 炭水5 / 塩分0.5 を入れたフォーム */
function formFixture(overrides: Partial<FoodFormValues> = {}): FoodFormValues {
  return {
    ...emptyFoodForm("テスト食品"),
    kcal: "100",
    proteinG: "10",
    fatG: "1",
    carbG: "5",
    saltG: "0.5",
    ...overrides,
  };
}

test("foodForm: 表記の基準は 3 択、栄養素の入力欄は 5 つ（表示名と単位つき）", () => {
  assert.deepEqual(BASIS_OPTIONS, [
    { kind: "unit", label: "1単位あたり" },
    { kind: "per100g", label: "100gあたり" },
    { kind: "bag", label: "1袋あたり" },
  ]);
  assert.deepEqual(NUTRIENT_FIELDS, [
    { key: "kcal", label: "カロリー", unit: "kcal" },
    { key: "proteinG", label: "たんぱく質", unit: "g" },
    { key: "fatG", label: "脂質", unit: "g" },
    { key: "carbG", label: "炭水化物", unit: "g" },
    { key: "saltG", label: "塩分", unit: "g" },
  ]);
});

test("foodForm.emptyFoodForm: 名前だけ入れた空のフォーム", () => {
  assert.deepEqual(emptyFoodForm("テスト"), {
    name: "テスト",
    category: "その他",
    unitLabel: "1個",
    basisKind: "unit",
    gramsPerUnit: "",
    bagGrams: "",
    kcal: "",
    proteinG: "",
    fatG: "",
    carbG: "",
    saltG: "",
    source: "label",
  });
});

test("foodForm.buildFood: 1 単位あたりの表記はそのまま。保存形のキーの順と時刻つき", () => {
  freezeTime(new Date(2026, 9, 11, 3, 4));
  const result = buildFood(formFixture());
  assert.deepEqual(result, {
    errors: [],
    preview: { kcal: 100, proteinG: 10, fatG: 1, carbG: 5, saltG: 0.5 },
    unitsPerBasis: 1,
    basisLabel: "1個あたり",
    food: {
      name: "テスト食品",
      unitLabel: "1個",
      gramsPerUnit: null,
      per: { kcal: 100, proteinG: 10, fatG: 1, carbG: 5, saltG: 0.5 },
      source: "label",
      basis: { label: "1個あたり", unitsPerBasis: 1 },
      category: "その他",
      note: "",
      aliases: [],
      variantGroupId: null,
      variantLabel: null,
      useCount: 0,
      lastUsedAt: null,
      archived: false,
      createdAt: "2026-10-11T03:04",
      updatedAt: "2026-10-11T03:04",
    },
  });
  assert.deepEqual(Object.keys(result), [
    "errors",
    "preview",
    "unitsPerBasis",
    "basisLabel",
    "food",
  ]);
  assert.deepEqual(Object.keys(result.food ?? {}), [
    "name",
    "unitLabel",
    "gramsPerUnit",
    "per",
    "source",
    "basis",
    "category",
    "note",
    "aliases",
    "variantGroupId",
    "variantLabel",
    "useCount",
    "lastUsedAt",
    "archived",
    "createdAt",
    "updatedAt",
  ]);
});

test("foodForm.buildFood: 名前・単位ラベルは前後の空白を落とし、source と category はフォームの値", () => {
  freezeTime(new Date(2026, 9, 11, 3, 4));
  const food = buildFood(
    formFixture({
      source: "estimated",
      category: "菓子",
      name: "  トリム  ",
      unitLabel: " 1個 ",
    }),
  ).food;
  assert.equal(food?.name, "トリム");
  assert.equal(food?.unitLabel, "1個");
  assert.equal(food?.source, "estimated");
  assert.equal(food?.category, "菓子");
});

test("foodForm.buildFood: 100g あたりの表記は 1 単位のグラム数で換算し、丸めない unitsPerBasis を残す", () => {
  freezeTime(new Date(2026, 9, 11, 3, 4));
  const thirty = buildFood(
    formFixture({
      basisKind: "per100g",
      gramsPerUnit: "30",
      kcal: "250",
    }),
  );
  assert.equal(thirty.basisLabel, "100gあたり");
  assert.equal(thirty.unitsPerBasis, 100 / 30);
  assert.deepEqual(thirty.preview, {
    kcal: 75,
    proteinG: 3,
    fatG: 0.3,
    carbG: 1.5,
    saltG: 0.15,
  });
  assert.equal(thirty.food?.gramsPerUnit, 30);
  assert.deepEqual(thirty.food?.basis, {
    label: "100gあたり",
    unitsPerBasis: 100 / 30,
  });

  const g115 = buildFood(
    formFixture({
      basisKind: "per100g",
      unitLabel: "1枚",
      gramsPerUnit: "115",
      kcal: "300",
      proteinG: "7.5",
    }),
  );
  assert.deepEqual(g115.preview, {
    kcal: 345,
    proteinG: 8.625,
    fatG: 1.15,
    carbG: 5.75,
    saltG: 0.575,
  });
});

test("foodForm.buildFood: 1 袋あたりの表記は 袋のグラム数 ÷ 1 単位のグラム数。空欄は null のまま", () => {
  freezeTime(new Date(2026, 9, 11, 3, 4));
  const bag = buildFood(
    formFixture({
      basisKind: "bag",
      unitLabel: "10g",
      gramsPerUnit: "10",
      bagGrams: "51",
      kcal: "76",
      proteinG: "0.8",
      fatG: "7.6",
      carbG: "",
      saltG: "0",
    }),
  );
  assert.equal(bag.basisLabel, "1袋(51g)あたり");
  assert.equal(bag.unitsPerBasis, 5.1);
  // 値は小数第 3 位で丸める。空欄は 0 で埋めない
  assert.deepEqual(bag.preview, {
    kcal: 14.902,
    proteinG: 0.157,
    fatG: 1.49,
    carbG: null,
    saltG: 0,
  });
});

test("foodForm.buildFood: 換算した値は小数第 3 位で丸める（2.675 ÷ 3.33… など）", () => {
  freezeTime(new Date(2026, 9, 11, 3, 4));
  const result = buildFood(
    formFixture({
      basisKind: "per100g",
      gramsPerUnit: "30",
      kcal: "100",
      proteinG: "2.675",
      fatG: "0.0004",
      carbG: "84.85",
      saltG: "1",
    }),
  );
  assert.deepEqual(result.preview, {
    kcal: 30,
    proteinG: 0.802,
    fatG: 0,
    carbG: 25.455,
    saltG: 0.3,
  });
});

test("foodForm.buildFood: 栄養値が全部空欄でも登録できる（全項目 null）", () => {
  freezeTime(new Date(2026, 9, 11, 3, 4));
  const result = buildFood(
    formFixture({ kcal: "", proteinG: "", fatG: "", carbG: "", saltG: "" }),
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.preview, nutrition());
  assert.deepEqual(result.food?.per, nutrition());
});

test("foodForm.buildFood: 入力の誤りは errors に溜め、food は null", () => {
  const result = buildFood(
    formFixture({
      name: "  ",
      unitLabel: "",
      kcal: "abc",
      proteinG: "-1",
      fatG: "",
      carbG: "1e400",
      saltG: "x",
    }),
  );
  assert.deepEqual(result.errors, [
    "名前を入力してください",
    "単位ラベルを入力してください（例: 1個 / 1食 / 10g）",
    "カロリーは0以上の数値で入力してください",
    "たんぱく質は0以上の数値で入力してください",
    "炭水化物は0以上の数値で入力してください",
    "塩分は0以上の数値で入力してください",
  ]);
  assert.equal(result.food, null);
  assert.deepEqual(result.preview, nutrition());
  assert.equal(result.basisLabel, "1単位あたり");

  const noGrams = buildFood(formFixture({ basisKind: "per100g" }));
  assert.deepEqual(noGrams.errors, [
    "100gあたりの表記から換算するため、1単位のグラム数が必要です",
  ]);
  assert.equal(noGrams.unitsPerBasis, null);
  assert.equal(noGrams.food, null);
  assert.equal(
    buildFood(formFixture({ basisKind: "per100g", gramsPerUnit: "0" })).food,
    null,
  );

  const bagErrors = buildFood(
    formFixture({ basisKind: "bag", gramsPerUnit: "", bagGrams: "0" }),
  );
  assert.deepEqual(bagErrors.errors, [
    "1袋あたりの表記から換算するため、1単位のグラム数が必要です",
    "1袋のグラム数を入力してください",
  ]);
  assert.equal(bagErrors.basisLabel, "1袋(0g)あたり");

  const noBag = buildFood(
    formFixture({ basisKind: "bag", unitLabel: "10g", gramsPerUnit: "10" }),
  );
  assert.deepEqual(noBag.errors, ["1袋のグラム数を入力してください"]);
  assert.equal(noBag.basisLabel, "1袋あたり");
});
