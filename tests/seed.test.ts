/**
 * 初期データの投入（db/seed.ts）の今の出力を固定する特性テスト。
 *
 * 守ること:
 *  - 版数は SEED_VERSION = 2、投入される初期データの中身（食品・固定ベース・種目・トレ記録・体組成・
 *    骨密度・サプリ・設定）は 1 文字も変えない。食事記録（MealEntry）は投入しない（原則 1）。
 *  - 設定の行がある端末ではフル投入をやり直さない。版数が古ければ呼び名の差分だけを当て、
 *    ユーザーが付けた呼び名とユーザーが足した食品は消さない。
 * 初期データは量が多いので、表ごとの件数と、行の並び・キーの順まで含めた SHA-256 で固定する
 * （食品 1 件・固定ベース・設定は中身も写してある）。ずれたときは表の名前で分かる。
 * Node には IndexedDB が無いので、表を tests/fakeTable.ts のメモリ上の表に差し替える。時刻は固定する。
 */
import { createHash } from "node:crypto";
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db/db.ts";
import { SEED_VERSION, seedIfEmpty } from "../src/db/seed.ts";
import { fakeTable } from "./fakeTable.ts";
import {
  foodFixture,
  freezeTime,
  restoreStubs,
  runScope,
  settingsFixture,
  stub,
  unfreezeTime,
} from "./helpers.ts";

afterEach(() => {
  restoreStubs();
  unfreezeTime();
});

/** 投入の対象になる表（settings は主キー id を自分で持つ） */
const SEEDED = [
  "foods",
  "shortcutSets",
  "exercises",
  "trainingSessions",
  "sessionExercises",
  "setRecords",
  "bodyCompositions",
  "boneDensities",
  "supplements",
  "settings",
] as const;

/** 起動時に件数を数える表（食事記録と未処理テキストは投入しない） */
const COUNTED = [
  "mealEntries",
  "pendingTexts",
  "shortcutSets",
  "exercises",
  "trainingSessions",
  "sessionExercises",
  "setRecords",
  "bodyCompositions",
  "boneDensities",
  "supplements",
] as const;

function digest(rows: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

test("seed: 初期データの版数は 2", () => {
  assert.equal(SEED_VERSION, 2);
});

test("seed.seedIfEmpty: 空の端末にフル投入する（表ごとの件数と中身の SHA-256）。食事記録は入れない", async () => {
  freezeTime(new Date(2026, 9, 11, 3, 4));
  stub(db, "transaction", runScope);
  const tables = {
    foods: fakeTable(db.foods),
    shortcutSets: fakeTable(db.shortcutSets),
    exercises: fakeTable(db.exercises),
    trainingSessions: fakeTable(db.trainingSessions),
    sessionExercises: fakeTable(db.sessionExercises),
    setRecords: fakeTable(db.setRecords),
    bodyCompositions: fakeTable(db.bodyCompositions),
    boneDensities: fakeTable(db.boneDensities),
    supplements: fakeTable(db.supplements),
    settings: fakeTable(db.settings),
    mealEntries: fakeTable(db.mealEntries),
    pendingTexts: fakeTable(db.pendingTexts),
  };

  await seedIfEmpty();

  assert.deepEqual(
    SEEDED.map((name) => [name, tables[name].length, digest(tables[name])]),
    [
      [
        "foods",
        24,
        "c449ac5404e0de323588eb0699017217ebb112f29231ef81bfe9db20e8a0f612",
      ],
      [
        "shortcutSets",
        1,
        "f90300ce48faf735e38f24fb6b70edfb802584ea75ed07a0128725a10d890472",
      ],
      [
        "exercises",
        12,
        "12cf20b9e27fae944903809d43c223e073233dfd0259a6abc4485bad7a6c9cb9",
      ],
      [
        "trainingSessions",
        3,
        "75bdea1fc2a6056cfa0593fe423b8978daf5ae0c986624e0912bca155e622e76",
      ],
      [
        "sessionExercises",
        6,
        "1779eaf99fc0a485739124e248b536cb3da68baddf444595a16a2d661246e99a",
      ],
      [
        "setRecords",
        9,
        "f6b578dcc7f0ff7662bb7ef3c2110c47fa0ab88c72ee14bf143050c24c80a041",
      ],
      [
        "bodyCompositions",
        1,
        "729512538003dd9ffe0d10f4e7ad21ef62cc275b61a64a6d410df6cbe7074f8a",
      ],
      [
        "boneDensities",
        1,
        "f42a0024c016dbd10ea0cf3e031205f2b1cef0045f915173809615b88606e19b",
      ],
      [
        "supplements",
        3,
        "108345cdc0446bbcdda5454aff52db54d8d4525b679d34e03758a6a95cd881a2",
      ],
      [
        "settings",
        1,
        "b8a8fc2ec8daca1795d2562d1bdad1644d5d897454d71a9fe54406d1709b4610",
      ],
    ],
  );
  // 食事記録（実績）と未処理テキストは投入しない。固定ベースは計画で、記録には入れない
  assert.equal(tables.mealEntries.length, 0);
  assert.equal(tables.pendingTexts.length, 0);
});

test("seed.seedIfEmpty: 食品 1 件・固定ベース・設定の中身（キーの順を含む）", async () => {
  freezeTime(new Date(2026, 9, 11, 3, 4));
  stub(db, "transaction", runScope);
  const foods = fakeTable(db.foods);
  const shortcutSets = fakeTable(db.shortcutSets);
  const settings = fakeTable(db.settings);
  for (const name of SEEDED) {
    if (name !== "foods" && name !== "shortcutSets" && name !== "settings") {
      fakeTable(db[name]);
    }
  }
  fakeTable(db.mealEntries);
  fakeTable(db.pendingTexts);

  await seedIfEmpty();

  assert.deepEqual(foods[0], {
    name: "味付ゆで玉子",
    unitLabel: "1個",
    gramsPerUnit: null,
    per: { kcal: 65, proteinG: 5.8, fatG: 4.3, carbG: null, saltG: 0.6 },
    source: "label",
    basis: {
      label: "2個あたり 130kcal / P11.6 / 脂質8.6 / 塩分1.2",
      unitsPerBasis: 2,
    },
    category: "卵",
    note: "1個単位に正規化して登録（固定ベースは2個）",
    aliases: ["卵", "ゆで卵", "ゆでたまご", "たまご", "味玉"],
    variantGroupId: null,
    variantLabel: null,
    useCount: 0,
    lastUsedAt: null,
    archived: false,
    createdAt: "2026-10-11T03:04",
    updatedAt: "2026-10-11T03:04",
    id: 1,
  });
  // 新規作成した食品のキーの順は、JSON バックアップの行のキーの順になる（id は保存時に最後に付く）
  assert.deepEqual(Object.keys(foods[0]), [
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
    "id",
  ]);
  assert.deepEqual(shortcutSets, [
    {
      name: "固定ベース",
      items: [
        { foodId: 1, quantity: 2, timing: "朝", note: "味付ゆで玉子2個" },
        {
          foodId: 8,
          quantity: 2,
          timing: "日中",
          note: "ミックスフルーツ30g×2杯",
        },
        {
          foodId: 7,
          quantity: 1,
          timing: "日中",
          note: "SAIJIRUSHI ソイ20g×1杯",
        },
        {
          foodId: 6,
          quantity: 1,
          timing: "間食",
          note: "高たんぱくヨーグルト1個",
        },
      ],
      order: 1,
      note: "これは計画であって実績ではない。タップしたときだけ記録に入る。合計 501kcal / P84.8g / 脂質12.9g / 塩分2.16g。プロテインをミックスフルーツ寄りにしているのは塩分のため（3杯すべてSAIJIRUSHIにすると約1.1g増える）",
      createdAt: "2026-10-11T03:04",
      updatedAt: "2026-10-11T03:04",
      id: 1,
    },
  ]);
  assert.deepEqual(settings, [
    {
      id: 1,
      profile: { heightCm: 170, sex: "male", age: 30 },
      bmrKcal: 1600,
      restDayKcal: 2000,
      gymDayKcal: 2200,
      proteinTargetG: 130,
      proteinCapG: 150,
      fatTargetG: 50,
      saltLimitG: 7,
      weeklySaltAverageG: 6,
      weeklyKcalTarget: 14600,
      weeklyKcalTolerance: 300,
      trainingPerWeek: 3,
      weekStartsOn: 1,
      dayBoundaryHour: 4,
      nextMeasurementDate: "2026-10-15",
      measurementChecklistLeadDays: 2,
      measurementMinRestDays: 3,
      goal: {
        fatMassKg: 11,
        leanMassKg: 56,
        targetDate: "2026-12-31",
        label: "2026年12月末",
      },
      alerts: {
        bmrFloorKcal: 1600,
        eveningCheckHour: 20,
        eveningRemainingKcal: 1300,
        afternoonCheckHour: 15,
        afternoonProgressRatio: 0.4,
        saltStreakDays: 2,
        noodleStreakDays: 2,
        weeklyKcalFloor: 14300,
        lowFatDayG: 40,
      },
      seedVersion: 2,
      updatedAt: "2026-10-11T03:04",
    },
  ]);
});

/** 投入済みの端末の見本。件数を数える表もメモリ上の表にしておく */
function installExistingDevice(seedVersion: number) {
  freezeTime(new Date(2026, 9, 11, 3, 4));
  stub(db, "transaction", runScope);
  for (const name of COUNTED) fakeTable(db[name]);
  const foods = fakeTable(db.foods, [
    foodFixture({ id: 1, name: "味付ゆで玉子", aliases: [] }),
    foodFixture({ id: 2, name: "ザバス MILK PROTEIN", aliases: ["ミルプロ"] }),
    foodFixture({ id: 3, name: "ユーザーが足した食品", aliases: [] }),
    foodFixture({
      id: 4,
      name: "カップヌードル BIG",
      variantLabel: "スープ残し",
      aliases: [],
    }),
  ]);
  const settings = fakeTable(db.settings, [settingsFixture({ seedVersion })]);
  return { foods, settings };
}

test("seed.seedIfEmpty: 設定の行があり版数が最新なら何も書かない（フル投入をやり直さない）", async () => {
  const device = installExistingDevice(SEED_VERSION);
  const before = JSON.stringify([device.foods, device.settings]);
  await seedIfEmpty();
  assert.equal(JSON.stringify([device.foods, device.settings]), before);
});

test("seed.seedIfEmpty: 版数が古い端末には既定の呼び名の差分だけを当てる（ユーザーの呼び名・食品は残す）", async () => {
  const device = installExistingDevice(1);
  await seedIfEmpty();

  assert.deepEqual(
    device.foods.map((food) => [food.id, food.name, food.aliases]),
    [
      [1, "味付ゆで玉子", ["卵", "ゆで卵", "ゆでたまご", "たまご", "味玉"]],
      // ユーザーが付けた呼び名が先頭に残り、既定の呼び名が後ろに足される
      [2, "ザバス MILK PROTEIN", ["ミルプロ", "ザバス", "ザバスミルク"]],
      [3, "ユーザーが足した食品", []],
      [4, "カップヌードル BIG", []],
    ],
  );
  // 食品は作り直さない（件数はそのまま）。版数と更新時刻だけ新しくなる
  assert.equal(device.foods.length, 4);
  assert.equal(device.settings[0].seedVersion, 2);
  assert.equal(device.settings[0].updatedAt, "2026-10-11T03:04");
});
