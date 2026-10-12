/**
 * 新しい食品の作り方（lib/foods.ts の newFood）と、食品を DB に足す処理（db/foods.ts の addFood）。
 *
 * 食品の行は、入力フォーム・貼り付けの推定・写真の推定・初期データのどれでも同じ既定値・同じキーの順で作る。
 * キーの順は IndexedDB に残り、JSON バックアップの行のキーの順になるので、ここで固定する。値は架空のサンプル。
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db/db.ts";
import { addFood } from "../src/db/foods.ts";
import { newFood } from "../src/lib/foods.ts";
import type { NewFoodFields } from "../src/lib/foods.ts";
import { nutrition, restoreStubs, stub } from "./helpers.ts";

afterEach(() => restoreStubs());

const NOW = "2026-10-11T15:30";

const FIELDS: NewFoodFields = {
  name: "テスト食品",
  unitLabel: "1個",
  gramsPerUnit: 30,
  per: nutrition({ kcal: 120, proteinG: 3.5, fatG: 1.25, saltG: 0.3 }),
  source: "label",
  basis: { label: "1個あたり", unitsPerBasis: 1 },
  category: "菓子",
  note: "メモ",
};

const KEYS = [
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
];

test("foods.newFood: 既定値（呼び名なし・バリアントなし・使用 0 回・在庫あり）とキーの順", () => {
  const food = newFood(FIELDS, NOW);
  assert.deepEqual(Object.keys(food), KEYS);
  assert.deepEqual(food, {
    name: "テスト食品",
    unitLabel: "1個",
    gramsPerUnit: 30,
    per: { kcal: 120, proteinG: 3.5, fatG: 1.25, carbG: null, saltG: 0.3 },
    source: "label",
    basis: { label: "1個あたり", unitsPerBasis: 1 },
    category: "菓子",
    note: "メモ",
    aliases: [],
    variantGroupId: null,
    variantLabel: null,
    useCount: 0,
    lastUsedAt: null,
    archived: false,
    createdAt: NOW,
    updatedAt: NOW,
  });
});

test("foods.newFood: 呼び名・バリアント・在庫切れを指定しても、キーの順は同じ", () => {
  const food = newFood(
    {
      ...FIELDS,
      aliases: ["テスト", "てすと"],
      variantGroupId: "group-1",
      variantLabel: "完飲",
      archived: true,
    },
    NOW,
  );
  assert.deepEqual(Object.keys(food), KEYS);
  assert.deepEqual(food.aliases, ["テスト", "てすと"]);
  assert.equal(food.variantGroupId, "group-1");
  assert.equal(food.variantLabel, "完飲");
  assert.equal(food.archived, true);
  assert.equal(food.useCount, 0);
  assert.equal(food.lastUsedAt, null);
});

test("foods.newFood: 呼び名の配列は食品ごとに別（共有しない）。作成と更新は同じ時刻", () => {
  const a = newFood(FIELDS, NOW);
  const b = newFood(FIELDS, NOW);
  assert.notEqual(a.aliases, b.aliases);
  a.aliases.push("x");
  assert.deepEqual(b.aliases, []);
  assert.equal(a.createdAt, a.updatedAt);
});

test("db/foods.addFood: 足した行の id を付けて返す。渡した下書きは書き換えない", async () => {
  const draft = newFood(FIELDS, NOW);
  const added: unknown[] = [];
  stub(db.foods, "add", async (row: unknown) => {
    added.push(row);
    return 42;
  });
  const food = await addFood(draft);
  assert.deepEqual(added, [draft]);
  assert.deepEqual(food, { ...draft, id: 42 });
  assert.ok(!("id" in draft));
});

test("db/foods.addFood: id が返らなければ止める（黙って次へ渡さない）", async () => {
  stub(db.foods, "add", async () => undefined);
  await assert.rejects(
    () => addFood(newFood(FIELDS, NOW)),
    /保存した行の id を取得できませんでした/,
  );
});
