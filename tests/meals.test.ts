/**
 * 食事記録の追加・更新・削除（lib/meals.ts）の今の出力を固定する特性テスト。
 *
 * 時刻の空欄を弾く部分は saveTime.test.ts が受け持つ。ここでは、保存する行の形（キーの順）・
 * 論理日付と実時刻の決まり方・頻度（useCount / lastUsedAt）の更新・取り消しを確かめる。
 * Node には IndexedDB が無いので、表を tests/fakeTable.ts のメモリ上の表に差し替える。値は架空のサンプル。
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db/db.ts";
import type { Food, MealEntry } from "../src/db/types.ts";
import {
  addMealEntries,
  deleteMealEntry,
  entryNutrition,
  formatQuantity,
  snapshotOf,
  updateMealEntry,
} from "../src/lib/meals.ts";
import { fakeTable } from "./fakeTable.ts";
import {
  catalogFixture,
  foodFixture,
  freezeTime,
  mealEntryFixture,
  restoreStubs,
  stub,
  unfreezeTime,
} from "./helpers.ts";

afterEach(() => {
  restoreStubs();
  unfreezeTime();
});

/** db.transaction の呼び出し（モードと対象の表の名前）を記録しつつ、そのまま実行する */
function recordTransactions(): unknown[][] {
  const calls: unknown[][] = [];
  stub(db, "transaction", async (...args: unknown[]) => {
    const scope = args[args.length - 1];
    calls.push(
      args
        .slice(0, -1)
        .map((arg) =>
          Array.isArray(arg)
            ? arg.map((table) => Reflect.get(table, "name"))
            : arg,
        ),
    );
    if (typeof scope !== "function")
      throw new Error("scope が関数ではありません");
    return scope();
  });
  return calls;
}

test("meals.snapshotOf: 記録時点の食品情報の写し（キーの順。栄養値は別オブジェクトにコピー）", () => {
  const [, , cupSoup] = catalogFixture();
  const snapshot = snapshotOf(cupSoup);
  assert.deepEqual(snapshot, {
    name: "カップヌードル BIG",
    variantLabel: "スープ残し",
    unitLabel: "1個",
    category: "麺類",
    source: "label",
    per: { kcal: 300, proteinG: null, fatG: null, carbG: null, saltG: 3 },
  });
  assert.deepEqual(Object.keys(snapshot), [
    "name",
    "variantLabel",
    "unitLabel",
    "category",
    "source",
    "per",
  ]);
  assert.notEqual(snapshot.per, cupSoup.per);
});

test("meals.entryNutrition / formatQuantity: 記録の栄養値は 1 単位あたり × 数量。数量は小数第 2 位までで末尾の 0 なし", () => {
  assert.deepEqual(entryNutrition(mealEntryFixture({ quantity: 1.5 })), {
    kcal: 150,
    proteinG: 15,
    fatG: 1.5,
    carbG: 1.5,
    saltG: 0.15,
  });
  assert.equal(formatQuantity(1), "1");
  assert.equal(formatQuantity(0.5), "0.5");
  assert.equal(formatQuantity(3), "3");
  assert.equal(formatQuantity(2.675), "2.68");
  assert.equal(formatQuantity(1 / 3), "0.33");
});

test("meals.addMealEntries: 記録を 1 トランザクションで追加し、食品の使用回数と最終使用日時を更新する", async () => {
  freezeTime(new Date(2026, 9, 11, 3, 4));
  const transactions = recordTransactions();
  const catalog = catalogFixture();
  const foods = fakeTable<Food>(db.foods, catalog);
  const entries = fakeTable<MealEntry>(db.mealEntries);

  const ids = await addMealEntries(
    "2026-10-10",
    [
      { food: catalog[0], quantity: 2, time: "01:30", note: "ザバス2本" },
      { food: catalog[1], quantity: 1, time: "21:00" },
    ],
    5,
    4,
  );

  assert.deepEqual(ids, [1, 2]);
  assert.deepEqual(transactions, [["rw", ["mealEntries", "foods"]]]);
  assert.deepEqual(entries, [
    {
      foodId: 1,
      quantity: 2,
      // 境界（4 時）より前の時刻は、論理日付の翌暦日に置く。集計の日付（logDate）は動かさない
      recordedAt: "2026-10-11T01:30",
      logDate: "2026-10-10",
      snapshot: snapshotOf(catalog[0]),
      fromShortcutSetId: 5,
      note: "ザバス2本",
      id: 1,
    },
    {
      foodId: 2,
      quantity: 1,
      recordedAt: "2026-10-10T21:00",
      logDate: "2026-10-10",
      snapshot: snapshotOf(catalog[1]),
      fromShortcutSetId: 5,
      note: "",
      id: 2,
    },
  ]);
  assert.deepEqual(Object.keys(entries[0]).slice(0, 7), [
    "foodId",
    "quantity",
    "recordedAt",
    "logDate",
    "snapshot",
    "fromShortcutSetId",
    "note",
  ]);
  // ザバス MILK PROTEIN は使用 5 回 → 6 回、ヨーグルトは 1 回 → 2 回。最終使用は今
  assert.deepEqual(
    foods.slice(0, 3).map((food) => [food.id, food.useCount, food.lastUsedAt]),
    [
      [1, 6, "2026-10-11T03:04"],
      [2, 2, "2026-10-11T03:04"],
      [3, 3, null],
    ],
  );
});

test("meals.addMealEntries: 頻度は渡された食品ではなく「その時点の DB の値」を基準に増やす", async () => {
  freezeTime(new Date(2026, 9, 11, 3, 4));
  recordTransactions();
  const stale = foodFixture({ id: 1, useCount: 0 });
  const foods = fakeTable<Food>(db.foods, [
    foodFixture({ id: 1, useCount: 7 }),
  ]);
  fakeTable<MealEntry>(db.mealEntries);
  await addMealEntries(
    "2026-10-10",
    [{ food: stale, quantity: 1, time: "12:00" }],
    null,
    4,
  );
  assert.equal(foods[0].useCount, 8);
});

test("meals.addMealEntries: 保存されていない食品（id なし）は「食品が保存されていません」", async () => {
  recordTransactions();
  fakeTable<Food>(db.foods);
  fakeTable<MealEntry>(db.mealEntries);
  await assert.rejects(
    addMealEntries(
      "2026-10-10",
      [{ food: foodFixture({ id: undefined }), quantity: 1, time: "12:00" }],
      null,
      4,
    ),
    /食品が保存されていません/,
  );
});

test("meals.updateMealEntry / deleteMealEntry: 数量と時刻だけ直す（論理日付は動かさない）。id の無い記録は何もしない", async () => {
  const [first, second] = [
    mealEntryFixture({
      id: 1,
      quantity: 2,
      recordedAt: "2026-10-10T08:00",
      logDate: "2026-10-10",
    }),
    mealEntryFixture({
      id: 2,
      quantity: 1,
      recordedAt: "2026-10-10T12:00",
      logDate: "2026-10-10",
    }),
  ];
  const entries = fakeTable<MealEntry>(db.mealEntries, [first, second]);

  await updateMealEntry(first, 3, "02:15", 4);
  assert.equal(entries[0].quantity, 3);
  // 4 時より前の時刻は翌暦日。logDate は 2026-10-10 のまま
  assert.equal(entries[0].recordedAt, "2026-10-11T02:15");
  assert.equal(entries[0].logDate, "2026-10-10");

  await updateMealEntry({ ...second, id: undefined }, 9, "10:00", 4);
  assert.equal(entries[1].quantity, 1);

  await deleteMealEntry({ ...second, id: undefined });
  assert.deepEqual(
    entries.map((entry) => entry.id),
    [1, 2],
  );
  await deleteMealEntry(second);
  assert.deepEqual(
    entries.map((entry) => entry.id),
    [1],
  );
});
