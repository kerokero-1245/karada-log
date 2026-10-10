/**
 * 料理の写真の見積もり → プレビューの行（lib/photoMeal.ts）の今の出力を固定する特性テスト。
 *
 * 写真の品目名はモデルが付けた一般名なので、マスタには「名前・呼び名・食べ方の名前が丸ごと一致したとき
 * （85 点以上）だけ」当てる。在庫切れの −25 は照合の判定には持ち込まない。値は架空のサンプル。
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  MATCH_MIN_SCORE,
  buildPhotoRows,
  estimatedFoodOf,
  gramsPerUnitOf,
  guessCategory,
  matchFood,
  perUnitOf,
  photoNoteOf,
  rawTextOf,
  unitLabelOf,
} from "../src/lib/photoMeal.ts";
import type { MealPhotoItem } from "../src/lib/vision.ts";
import {
  catalogFixture,
  foodFixture,
  freezeTime,
  nutrition,
  unfreezeTime,
} from "./helpers.ts";

afterEach(() => unfreezeTime());

/** 品目の見本。ご飯 1杯 の概算値 */
function itemFixture(overrides: Partial<MealPhotoItem> = {}): MealPhotoItem {
  return {
    name: "ご飯",
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

test("photoMeal: マスタ照合を認める最低スコアは 85 点", () => {
  assert.equal(MATCH_MIN_SCORE, 85);
});

test("photoMeal.rawTextOf / photoNoteOf: 「名前 数量単位」と、メモに残す「写真: 原文」", () => {
  assert.equal(rawTextOf(itemFixture()), "ご飯 1杯");
  assert.equal(
    rawTextOf(itemFixture({ quantity: 0.5, unit: "切れ" })),
    "ご飯 0.5切れ",
  );
  assert.equal(
    rawTextOf(itemFixture({ name: "焼き鮭", quantity: 2.675, unit: "切れ" })),
    "焼き鮭 2.68切れ",
  );
  // 単位が数字から始まるときも、数量を前に付けるだけ（今の出力）
  assert.equal(rawTextOf(itemFixture({ unit: "100g" })), "ご飯 1100g");
  assert.equal(photoNoteOf(itemFixture()), "写真: ご飯 1杯");
});

test("photoMeal.perUnitOf: 数量ぶんの合計を 1 単位あたりに割り、小数第 3 位で丸める", () => {
  assert.deepEqual(
    perUnitOf(
      itemFixture({
        quantity: 2,
        kcal: 266,
        proteinG: 44,
        fatG: 9,
        carbG: 0.2,
        saltG: 1.6,
      }),
    ),
    { kcal: 133, proteinG: 22, fatG: 4.5, carbG: 0.1, saltG: 0.8 },
  );
  assert.deepEqual(
    perUnitOf(
      itemFixture({
        quantity: 3,
        kcal: 100,
        proteinG: 1,
        fatG: null,
        carbG: 2,
        saltG: 0.1,
      }),
    ),
    { kcal: 33.333, proteinG: 0.333, fatG: null, carbG: 0.667, saltG: 0.033 },
  );
  assert.deepEqual(
    perUnitOf(itemFixture({ quantity: 7, kcal: 100, proteinG: 2.675 })),
    { kcal: 14.286, proteinG: 0.382, fatG: 0.071, carbG: 7.957, saltG: 0 },
  );
});

test("photoMeal.perUnitOf: 数量が 0 以下なら 1 として割る", () => {
  const whole = { kcal: 100, proteinG: 3.8, fatG: 0.5, carbG: 55.7, saltG: 0 };
  assert.deepEqual(perUnitOf(itemFixture({ quantity: 0, kcal: 100 })), whole);
  assert.deepEqual(perUnitOf(itemFixture({ quantity: -1, kcal: 100 })), whole);
});

test("photoMeal.unitLabelOf: 食品マスタと同じ書き方（'杯' → '1杯'、'100g' はそのまま、空は '1食'）", () => {
  assert.equal(unitLabelOf("杯"), "1杯");
  assert.equal(unitLabelOf("100g"), "100g");
  assert.equal(unitLabelOf(""), "1食");
  assert.equal(unitLabelOf("  "), "1食");
  assert.equal(unitLabelOf("１杯"), "1杯");
  assert.equal(unitLabelOf(" 2個 "), "2個");
  assert.equal(unitLabelOf("g"), "1g");
});

test("photoMeal.gramsPerUnitOf: 単位が重さそのものならグラム数を拾う", () => {
  assert.equal(gramsPerUnitOf("100g"), 100);
  assert.equal(gramsPerUnitOf("30ml"), 30);
  assert.equal(gramsPerUnitOf("250グラム"), 250);
  assert.equal(gramsPerUnitOf("1.5g"), 1.5);
  assert.equal(gramsPerUnitOf("100 g"), 100);
  assert.equal(gramsPerUnitOf("１００ｇ"), 100);
  assert.equal(gramsPerUnitOf("100G"), 100);
  assert.equal(gramsPerUnitOf("0g"), null);
  assert.equal(gramsPerUnitOf("g"), null);
  assert.equal(gramsPerUnitOf("杯"), null);
});

test("photoMeal.guessCategory: 品目名からカテゴリの既定値を決める（先に当たったものが勝つ）", () => {
  const expectations: [string, string][] = [
    ["ラーメン", "麺類"],
    ["つけ麺", "麺類"],
    ["ご飯", "主食"],
    ["おにぎり", "主食"],
    ["鮭の塩焼き", "魚"],
    ["さば", "魚"],
    ["卵焼き", "卵"],
    ["目玉焼き", "卵"],
    ["鶏むね肉", "肉"],
    ["プロテイン", "プロテイン"],
    ["アーモンド", "ナッツ"],
    ["バナナ", "果物"],
    ["チョコ", "菓子"],
    ["コーヒー", "飲料"],
    ["味噌汁", "弁当・惣菜"],
    ["サラダ", "弁当・惣菜"],
    ["納豆", "弁当・惣菜"],
    ["ヨーグルト", "乳製品"],
    ["謎", "その他"],
    ["とんかつ", "その他"],
    ["", "その他"],
    ["  ", "その他"],
    // 複数の語に当たるときは、表の上にあるカテゴリが勝つ（今の出力）
    ["ラーメンライス", "麺類"],
    ["焼きそばパン", "麺類"],
    ["牛丼", "主食"],
    ["牛乳", "肉"],
  ];
  for (const [name, category] of expectations) {
    assert.equal(guessCategory(name), category, name);
  }
});

test("photoMeal.matchFood: 名前・呼び名・食べ方の名前が丸ごと一致したときだけ採る", () => {
  const catalog = catalogFixture();
  const idOf = (name: string) =>
    matchFood(itemFixture({ name }), catalog)?.id ?? null;

  // 100 点（名前）・90 点（呼び名）・85 点（食べ方の名前）は採る
  assert.equal(idOf("ザバス MILK PROTEIN"), 1);
  assert.equal(idOf("ザバス"), 1);
  assert.equal(idOf("味付ゆで玉子"), 8);
  assert.equal(idOf("ゆで卵"), 8);
  assert.equal(idOf("ゆでたまご"), 8);
  assert.equal(idOf("カップヌードル BIG"), 3);
  assert.equal(idOf("スープ残し"), 3);
  // 70 点（名前に含まれる）以下は採らない。「ご飯」が「から揚げ弁当（ごはん大盛）」に当たる事故の予防
  assert.equal(idOf("カップヌードル"), null);
  assert.equal(idOf("玉子"), null);
  assert.equal(idOf("プロテイン"), null);
  assert.equal(idOf("麺類"), null);
  assert.equal(idOf("ヨーグルト"), null);
  assert.equal(idOf("ご飯"), null);
  assert.equal(idOf(""), null);
});

test("photoMeal.matchFood: 在庫切れの −25 は照合に持ち込まない。同点が並ぶときは決め打ちしない", () => {
  const catalog = catalogFixture();
  // ビーレジェンドは在庫切れ。候補のスコアは 75 だが、−25 を戻すので 100 点として採る
  assert.equal(
    matchFood(itemFixture({ name: "ビーレジェンド" }), catalog)?.id,
    7,
  );
  const duplicated = [
    foodFixture({ id: 31, name: "ヨーグルト" }),
    foodFixture({ id: 32, name: "ヨーグルト" }),
  ];
  assert.equal(
    matchFood(itemFixture({ name: "ヨーグルト" }), duplicated),
    null,
  );
});

test("photoMeal.buildPhotoRows: 当たった行はマスタの値と換算、当たらない行は見積もりのまま", () => {
  const catalog = catalogFixture();
  const rows = buildPhotoRows(
    {
      items: [
        itemFixture(),
        itemFixture({
          name: "味付ゆで玉子",
          quantity: 2,
          unit: "個",
          kcal: 130,
          proteinG: 11.6,
          fatG: 8.6,
          carbG: null,
          saltG: 1.2,
        }),
        itemFixture({ name: "マカダミア", quantity: 30, unit: "g" }),
        itemFixture({
          name: "トップバリュ 素焼きマカダミア",
          quantity: 30,
          unit: "g",
          kcal: 228,
        }),
      ],
      notes: "見積もりの前提",
    },
    catalog,
  );

  assert.deepEqual(
    rows.map((row) => ({
      index: row.index,
      raw: row.raw,
      matched: row.matched?.id ?? null,
      quantity: row.quantity,
      per: row.per,
      unitLabel: row.unitLabel,
      notes: row.notes,
    })),
    [
      {
        index: 0,
        raw: "ご飯 1杯",
        matched: null,
        quantity: 1,
        per: { kcal: 252, proteinG: 3.8, fatG: 0.5, carbG: 55.7, saltG: 0 },
        unitLabel: "1杯",
        notes: [],
      },
      {
        index: 1,
        raw: "味付ゆで玉子 2個",
        matched: 8,
        quantity: 2,
        per: nutrition({ kcal: 65, proteinG: 5.8, fatG: 4.3, saltG: 0.6 }),
        unitLabel: "1個",
        notes: [],
      },
      // 「マカダミア」は名前に含まれるだけ（70 点）なので採らず、見積もりのまま 1g あたりにする
      {
        index: 2,
        raw: "マカダミア 30g",
        matched: null,
        quantity: 30,
        per: {
          kcal: 8.4,
          proteinG: 0.127,
          fatG: 0.017,
          carbG: 1.857,
          saltG: 0,
        },
        unitLabel: "1g",
        notes: [],
      },
      // 名前が丸ごと一致すれば採り、30g は 10g 単位 × 3 に換算する
      {
        index: 3,
        raw: "トップバリュ 素焼きマカダミア 30g",
        matched: 10,
        quantity: 3,
        per: nutrition({ kcal: 76, proteinG: 0.8, fatG: 7.6, saltG: 0 }),
        unitLabel: "10g",
        notes: [],
      },
    ],
  );
  assert.deepEqual(Object.keys(rows[0]), [
    "index",
    "item",
    "raw",
    "matched",
    "quantity",
    "per",
    "unitLabel",
    "notes",
  ]);
});

test("photoMeal.estimatedFoodOf: 推定食品の下書き（保存データの形・キーの順）", () => {
  const now = new Date(2026, 8, 22, 21, 5);
  const draft = estimatedFoodOf(
    itemFixture({
      name: " 焼き鮭 ",
      quantity: 2,
      unit: "切れ",
      kcal: 266,
      proteinG: 44,
      fatG: 9,
      carbG: 0.2,
      saltG: 1.6,
    }),
    now,
  );
  assert.deepEqual(draft, {
    name: "焼き鮭",
    unitLabel: "1切れ",
    gramsPerUnit: null,
    per: { kcal: 133, proteinG: 22, fatG: 4.5, carbG: 0.1, saltG: 0.8 },
    source: "estimated",
    basis: { label: "写真からの推定（2切れあたり）", unitsPerBasis: 2 },
    category: "魚",
    note: "写真から推定 2026-09-22",
    aliases: [],
    variantGroupId: null,
    variantLabel: null,
    useCount: 0,
    lastUsedAt: null,
    archived: false,
    createdAt: "2026-09-22T21:05",
    updatedAt: "2026-09-22T21:05",
  });
  assert.deepEqual(Object.keys(draft), [
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

test("photoMeal.estimatedFoodOf: 名前が空なら「写真の品目」、重さの単位なら gramsPerUnit に入る", () => {
  const now = new Date(2026, 8, 22, 21, 5);
  const blank = estimatedFoodOf(
    itemFixture({ name: "  ", quantity: 0, unit: "100g" }),
    now,
  );
  assert.equal(blank.name, "写真の品目");
  assert.equal(blank.gramsPerUnit, 100);
  assert.equal(blank.unitLabel, "100g");
  assert.equal(blank.category, "その他");
  // 数量 0 は 1 として扱い、単位が数字から始まるので表記は「1100g」になる（今の出力）
  assert.deepEqual(blank.basis, {
    label: "写真からの推定（1100gあたり）",
    unitsPerBasis: 1,
  });
  // 時刻を渡さなければ今の時刻を使う（固定した時刻で確かめる）
  freezeTime(new Date(2026, 0, 2, 3, 4));
  const stamped = estimatedFoodOf(itemFixture());
  assert.equal(stamped.createdAt, "2026-01-02T03:04");
  assert.equal(stamped.note, "写真から推定 2026-01-02");
});
