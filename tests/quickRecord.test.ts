/**
 * テキスト・貼り付けの「記録する」（lib/quickRecord.ts / lib/importRecord.ts）と
 * 写真の「○件を記録」（lib/photoRecord.ts）の今の出力を固定する特性テスト。
 *
 * 時刻の空欄を弾く部分は saveTime.test.ts が受け持つ。ここでは、1 回の操作で起きること
 * （推定食品を作る → 記録にする → 呼び名を覚える → 解決できなかった原文を預ける → 元の行を消す）の
 * 中身と、保存する行の形（キーの順）を確かめる。Node には IndexedDB が無いので、表を
 * tests/fakeTable.ts のメモリ上の表に差し替える。値は架空のサンプル。
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db/db.ts";
import type { Food, MealEntry, PendingText } from "../src/db/types.ts";
import { commitImport } from "../src/lib/importRecord.ts";
import { estimatedFoodOf } from "../src/lib/photoMeal.ts";
import type { PhotoMealRow } from "../src/lib/photoMeal.ts";
import { commitPhotoMeal } from "../src/lib/photoRecord.ts";
import {
  addEntryPlans,
  addPendingPlans,
  commitQuickText,
  deletePendingText,
  learnFromPlans,
} from "../src/lib/quickRecord.ts";
import type { QuickEntryPlan } from "../src/lib/quickRecord.ts";
import type { MealPhotoItem } from "../src/lib/vision.ts";
import { fakeTable } from "./fakeTable.ts";
import {
  catalogFixture,
  foodFixture,
  freezeTime,
  mealEntryFixture,
  nutrition,
  restoreStubs,
  runScope,
  stub,
  unfreezeTime,
} from "./helpers.ts";

afterEach(() => {
  restoreStubs();
  unfreezeTime();
});

const NOW = new Date(2026, 9, 11, 3, 4);

function planFixture(overrides: Partial<QuickEntryPlan> = {}): QuickEntryPlan {
  return {
    food: null,
    draft: null,
    quantity: 1,
    time: "12:00",
    raw: "原文",
    manual: false,
    learnText: "",
    ...overrides,
  };
}

/** 推定食品の下書き（id なし） */
function draftFixture(name: string): Omit<Food, "id"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- id を rest で落として、id なしの下書きを作るために分割している
  const { id: _id, ...draft } = foodFixture({ name, source: "estimated" });
  return draft;
}

/** 未処理テキストの行（見本） */
function pendingRow(id: number, text: string): PendingText {
  return {
    id,
    text,
    reason: "見つかりませんでした",
    logDate: "2026-10-10",
    recordedAt: "2026-10-10T12:00",
    createdAt: "2026-10-10T12:01",
  };
}

/** 記録に使う表（食品・記録・未処理）をメモリ上の表にして、トランザクションを素通しにする */
function installTables(
  initial: {
    foods?: Food[];
    entries?: MealEntry[];
    pending?: PendingText[];
  } = {},
) {
  stub(db, "transaction", runScope);
  return {
    foods: fakeTable<Food>(db.foods, initial.foods),
    entries: fakeTable<MealEntry>(db.mealEntries, initial.entries),
    pending: fakeTable<PendingText>(db.pendingTexts, initial.pending),
  };
}

test("quickRecord.addEntryPlans: マスタの食品はそのまま記録し、推定の下書きは先に Food として作ってから記録する", async () => {
  freezeTime(NOW);
  const catalog = catalogFixture();
  const tables = installTables({ foods: catalog });
  const draft = draftFixture("謎の丼");

  const result = await addEntryPlans(
    "2026-10-10",
    [
      planFixture({
        food: catalog[0],
        quantity: 2,
        time: "08:00",
        raw: "ザバス2本",
      }),
      planFixture({ draft, quantity: 1, time: "12:30", raw: "謎の丼=650" }),
      // 食品も下書きも無い項目は飛ばす（数えない）
      planFixture({ raw: "空" }),
    ],
    4,
  );

  assert.deepEqual(result, { added: 2, createdFoods: 1 });
  // 推定食品は id つきで食品の表に入り、記録されたので使用回数 1・最終使用は今になる
  assert.equal(tables.foods.length, 13);
  assert.deepEqual(tables.foods[12], {
    ...draft,
    id: 13,
    useCount: 1,
    lastUsedAt: "2026-10-11T03:04",
  });
  assert.deepEqual(
    tables.entries.map((entry) => [
      entry.foodId,
      entry.quantity,
      entry.recordedAt,
      entry.logDate,
      entry.note,
    ]),
    [
      [1, 2, "2026-10-10T08:00", "2026-10-10", "ザバス2本"],
      [13, 1, "2026-10-10T12:30", "2026-10-10", "謎の丼=650"],
    ],
  );
  assert.equal(tables.foods[0].useCount, 6);
});

test("quickRecord.addEntryPlans: 記録する項目が無ければ記録の追加に進まない", async () => {
  const tables = installTables({ foods: catalogFixture() });
  const result = await addEntryPlans("2026-10-10", [planFixture()], 4);
  assert.deepEqual(result, { added: 0, createdFoods: 0 });
  assert.equal(tables.entries.length, 0);
});

test("quickRecord.learnFromPlans: 手で解決した項目の呼び名だけを、衝突しないときに覚える", async () => {
  freezeTime(NOW);
  const catalog = catalogFixture();
  const tables = installTables({ foods: catalog });

  const learned = await learnFromPlans([
    // 覚える
    planFixture({ food: catalog[0], manual: true, learnText: "ミルプロ" }),
    // 同じ呼び名がもう一度出ても二重では覚えない（手元の食品も更新される）
    planFixture({ food: catalog[0], manual: true, learnText: "ミルプロ" }),
    // 手で解決していない
    planFixture({ food: catalog[0], manual: false, learnText: "別の呼び名" }),
    // 食品が無い・id が無い・空の呼び名
    planFixture({ food: null, manual: true, learnText: "推定の品" }),
    planFixture({
      food: foodFixture({ id: undefined }),
      manual: true,
      learnText: "idなし",
    }),
    planFixture({ food: catalog[0], manual: true, learnText: "   " }),
    // すでに名前そのもの・登録済みの呼び名
    planFixture({ food: catalog[0], manual: true, learnText: "ザバス" }),
    planFixture({
      food: catalog[0],
      manual: true,
      learnText: "ざばす milk protein",
    }),
    // ほかの食品の名前・呼び名とぶつかる
    planFixture({
      food: catalog[0],
      manual: true,
      learnText: "ビーレジェンド",
    }),
    planFixture({ food: catalog[0], manual: true, learnText: "ゆで卵" }),
  ]);

  assert.deepEqual(learned, [
    { text: "ミルプロ", foodName: "ザバス MILK PROTEIN" },
  ]);
  assert.deepEqual(tables.foods[0].aliases, [
    "ザバス",
    "ザバスミルク",
    "ミルプロ",
  ]);
  assert.equal(tables.foods[0].updatedAt, "2026-10-11T03:04");
  // 覚えなかった食品は触らない
  assert.equal(tables.foods[7].updatedAt, "2026-10-05T12:00");
});

test("quickRecord.addPendingPlans: 解決できなかった原文を、栄養値なしで未処理として預ける", async () => {
  freezeTime(NOW);
  const tables = installTables();
  await addPendingPlans(
    "2026-10-10",
    [
      { raw: "分からない品", reason: "見つかりませんでした", time: "21:30" },
      { raw: "夜食", reason: "候補から選べていません", time: "01:00" },
    ],
    4,
  );
  assert.deepEqual(tables.pending, [
    {
      text: "分からない品",
      reason: "見つかりませんでした",
      logDate: "2026-10-10",
      recordedAt: "2026-10-10T21:30",
      createdAt: "2026-10-11T03:04",
      id: 1,
    },
    {
      text: "夜食",
      reason: "候補から選べていません",
      logDate: "2026-10-10",
      recordedAt: "2026-10-11T01:00",
      createdAt: "2026-10-11T03:04",
      id: 2,
    },
  ]);
  assert.deepEqual(Object.keys(tables.pending[0]).slice(0, 5), [
    "text",
    "reason",
    "logDate",
    "recordedAt",
    "createdAt",
  ]);
});

test("quickRecord.addPendingPlans: 預けるものが無ければ何も書かない", async () => {
  const tables = installTables();
  await addPendingPlans("2026-10-10", [], 4);
  assert.equal(tables.pending.length, 0);
});

test("quickRecord.commitQuickText: 記録・呼び名・未処理を 1 トランザクションで行い、元の未処理の行を消す", async () => {
  freezeTime(NOW);
  const catalog = catalogFixture();
  const tables = installTables({
    foods: catalog,
    pending: [pendingRow(41, "元の行")],
  });

  const result = await commitQuickText(
    "2026-10-10",
    [
      planFixture({
        food: catalog[0],
        quantity: 2,
        time: "08:00",
        raw: "ザバス2本",
        manual: true,
        learnText: "ミルプロ",
      }),
      planFixture({
        draft: draftFixture("謎の丼"),
        time: "12:30",
        raw: "謎の丼=650",
      }),
    ],
    [{ raw: "分からない品", reason: "見つかりませんでした", time: "21:30" }],
    41,
    4,
  );

  assert.deepEqual(result, {
    added: 2,
    pending: 1,
    learned: [{ text: "ミルプロ", foodName: "ザバス MILK PROTEIN" }],
    createdFoods: 1,
  });
  assert.deepEqual(Object.keys(result), [
    "added",
    "pending",
    "learned",
    "createdFoods",
  ]);
  assert.equal(tables.entries.length, 2);
  assert.deepEqual(tables.foods[0].aliases, [
    "ザバス",
    "ザバスミルク",
    "ミルプロ",
  ]);
  // 元の未処理（id 41）は消え、新しく預けた 1 件だけが残る
  assert.deepEqual(
    tables.pending.map((row) => row.text),
    ["分からない品"],
  );
});

test("quickRecord.commitQuickText: 元の未処理の行が無ければ消さない。deletePendingText は 1 件捨てる", async () => {
  const tables = installTables({
    pending: [pendingRow(1, "A"), pendingRow(2, "B")],
  });

  const result = await commitQuickText("2026-10-10", [], [], null, 4);
  assert.deepEqual(result, {
    added: 0,
    pending: 0,
    learned: [],
    createdFoods: 0,
  });
  assert.equal(tables.entries.length, 0);
  assert.equal(tables.pending.length, 2);

  await deletePendingText(1);
  assert.deepEqual(
    tables.pending.map((row) => row.text),
    ["B"],
  );
});

function photoItem(
  name: string,
  overrides: Partial<MealPhotoItem> = {},
): MealPhotoItem {
  return {
    name,
    quantity: 1,
    unit: "杯",
    kcal: 252,
    proteinG: 3.8,
    fatG: 0.5,
    carbG: 55.7,
    saltG: 0,
    confidence: "high",
    ...overrides,
  };
}

function photoRow(item: MealPhotoItem, matched: Food | null): PhotoMealRow {
  return {
    index: 0,
    item,
    raw: `${item.name} ${item.quantity}${item.unit}`,
    matched,
    quantity: item.quantity,
    per: matched?.per ?? nutrition(),
    unitLabel: matched?.unitLabel ?? "1杯",
    notes: [],
  };
}

test("photoRecord.commitPhotoMeal: マスタに当たった行はその食品、当たらなかった行は推定食品を作って記録する（メモは「写真: 原文」）", async () => {
  freezeTime(NOW);
  const catalog = catalogFixture();
  const tables = installTables({ foods: catalog });
  const rice = photoItem("ご飯");

  const result = await commitPhotoMeal(
    "2026-10-10",
    [
      {
        row: photoRow(
          photoItem("味付ゆで玉子", { quantity: 2, unit: "個" }),
          catalog[7],
        ),
        quantity: 2,
        time: "08:00",
      },
      { row: photoRow(rice, null), quantity: 1, time: "12:30" },
    ],
    4,
  );

  assert.deepEqual(result, {
    added: 2,
    pending: 0,
    learned: [],
    createdFoods: 1,
  });
  assert.deepEqual(Object.keys(result), [
    "added",
    "pending",
    "learned",
    "createdFoods",
  ]);
  assert.deepEqual(tables.foods[12], {
    ...estimatedFoodOf(rice, NOW),
    id: 13,
    useCount: 1,
    lastUsedAt: "2026-10-11T03:04",
  });
  assert.deepEqual(
    tables.entries.map((entry) => [
      entry.foodId,
      entry.quantity,
      entry.recordedAt,
      entry.note,
    ]),
    [
      [8, 2, "2026-10-10T08:00", "写真: 味付ゆで玉子 2個"],
      [13, 1, "2026-10-10T12:30", "写真: ご飯 1杯"],
    ],
  );
});

test("photoRecord.commitPhotoMeal: 記録する品目が無ければ何も書かない", async () => {
  const tables = installTables({ foods: catalogFixture() });
  const result = await commitPhotoMeal("2026-10-10", [], 4);
  assert.deepEqual(result, {
    added: 0,
    pending: 0,
    learned: [],
    createdFoods: 0,
  });
  assert.equal(tables.entries.length, 0);
});

test("importRecord.commitImport: 「置き換える」日の既存の記録を消してから日ごとに入れ、日数・件数を数える", async () => {
  freezeTime(NOW);
  const catalog = catalogFixture();
  const tables = installTables({
    foods: catalog,
    entries: [
      mealEntryFixture({
        id: 91,
        logDate: "2026-10-08",
        recordedAt: "2026-10-08T12:00",
      }),
      mealEntryFixture({
        id: 92,
        logDate: "2026-10-08",
        recordedAt: "2026-10-08T19:00",
      }),
      mealEntryFixture({
        id: 93,
        logDate: "2026-10-09",
        recordedAt: "2026-10-09T12:00",
      }),
    ],
  });

  const result = await commitImport(
    [
      {
        logDate: "2026-10-08",
        replace: true,
        entries: [
          planFixture({ food: catalog[0], time: "08:00", raw: "ザバス" }),
        ],
        pending: [{ raw: "謎", reason: "見つかりませんでした", time: "20:00" }],
      },
      {
        logDate: "2026-10-09",
        replace: false,
        entries: [
          planFixture({
            draft: draftFixture("貼り付けの丼"),
            time: "12:00",
            raw: "丼=700",
          }),
          planFixture({
            food: catalog[7],
            manual: true,
            learnText: "ゆで",
            time: "13:00",
            raw: "ゆで",
          }),
        ],
        pending: [],
      },
      { logDate: "2026-10-10", replace: false, entries: [], pending: [] },
    ],
    4,
  );

  assert.deepEqual(result, {
    added: 3,
    pending: 1,
    learned: [{ text: "ゆで", foodName: "味付ゆで玉子" }],
    createdFoods: 1,
    days: 2,
    replacedDays: 1,
    removed: 2,
  });
  assert.deepEqual(Object.keys(result), [
    "added",
    "pending",
    "learned",
    "createdFoods",
    "days",
    "replacedDays",
    "removed",
  ]);
  // 10/8 の既存 2 件（91・92）は消え、10/9 の既存 1 件（93）は残る。新しい行は続きの番号
  assert.deepEqual(
    tables.entries.map((entry) => [entry.id, entry.logDate]),
    [
      [93, "2026-10-09"],
      [94, "2026-10-08"],
      [95, "2026-10-09"],
      [96, "2026-10-09"],
    ],
  );
  assert.equal(tables.pending.length, 1);
});
