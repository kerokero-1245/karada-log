/**
 * 食品一覧の絞り込みと、バリアントの束ね（screens/meal/foodGroups.ts）の今の出力を固定する特性テスト。
 *
 * 絞り込みはテキスト記録（lib/quickText.ts）と同じ normalize で比べる。バリアントは一覧では 1 行にまとめ、
 * 使った回数は行単位（= バリアントの合計）で数える。値は架空のサンプル。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupFoods,
  matchesQuery,
  sortByFrequency,
} from "../src/screens/meal/foodGroups.ts";
import type { FoodGroup } from "../src/screens/meal/foodGroups.ts";
import { groupKeyOf, sortVariants } from "../src/lib/quickText.ts";
import { catalogFixture, foodFixture } from "./helpers.ts";

test("foodGroups.matchesQuery: 名前・バリアント名・カテゴリ・呼び名の部分一致（正規化して比べる）", () => {
  const catalog = catalogFixture();
  const idsFor = (query: string) =>
    catalog.filter((food) => matchesQuery(food, query)).map((food) => food.id);

  // 空の検索語は全部通す
  assert.deepEqual(idsFor(""), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(idsFor("  "), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  // 呼び名（ひらがなでもカタカナの名前・呼び名に当たる）
  assert.deepEqual(idsFor("ざばす"), [1, 2]);
  assert.deepEqual(idsFor("ゆで卵"), [8]);
  assert.deepEqual(idsFor("ゆでたまご"), [8]);
  // 全角・大文字小文字
  assert.deepEqual(idsFor("milk"), [1]);
  assert.deepEqual(idsFor("ＭＩＬＫ"), [1]);
  // 名前とバリアント名をまたぐ書き方
  assert.deepEqual(idsFor("BIG スープ"), [3, 4]);
  assert.deepEqual(idsFor("スープ残し"), [3]);
  // カテゴリ
  assert.deepEqual(idsFor("麺類"), [3, 4, 5, 6]);
  assert.deepEqual(idsFor("プロテイン"), [1, 7]);
  assert.deepEqual(idsFor("めん"), []);
  assert.deepEqual(idsFor("存在しない"), []);
});

test("foodGroups.groupFoods: variantGroupId が同じ食品を 1 行に束ね、元の並びの最初の食品が代表", () => {
  const groups = groupFoods(catalogFixture());
  assert.deepEqual(
    groups.map((group) => ({
      key: group.key,
      name: group.name,
      category: group.category,
      ids: group.foods.map((food) => food.id),
      useCount: group.useCount,
      lastUsedAt: group.lastUsedAt,
      archived: group.archived,
    })),
    [
      {
        key: "food-1",
        name: "ザバス MILK PROTEIN",
        category: "プロテイン",
        ids: [1],
        useCount: 5,
        lastUsedAt: null,
        archived: false,
      },
      {
        key: "food-2",
        name: "ザバス ヨーグルト（マンゴー）",
        category: "乳製品",
        ids: [2],
        useCount: 1,
        lastUsedAt: null,
        archived: false,
      },
      // 使った回数はバリアントの合計（3 + 3）
      {
        key: "cupnoodle-big",
        name: "カップヌードル BIG",
        category: "麺類",
        ids: [3, 4],
        useCount: 6,
        lastUsedAt: null,
        archived: false,
      },
      {
        key: "marugame",
        name: "丸亀 旨辛豚つけ汁うどん 3玉",
        category: "麺類",
        ids: [5, 6],
        useCount: 0,
        lastUsedAt: null,
        archived: false,
      },
      {
        key: "food-7",
        name: "ビーレジェンド",
        category: "プロテイン",
        ids: [7],
        useCount: 0,
        lastUsedAt: null,
        archived: true,
      },
      {
        key: "food-8",
        name: "味付ゆで玉子",
        category: "卵",
        ids: [8],
        useCount: 9,
        lastUsedAt: null,
        archived: false,
      },
      {
        key: "food-9",
        name: "ゴールドジム スムージー",
        category: "飲料",
        ids: [9],
        useCount: 0,
        lastUsedAt: null,
        archived: false,
      },
      {
        key: "food-10",
        name: "トップバリュ 素焼きマカダミア",
        category: "ナッツ",
        ids: [10],
        useCount: 0,
        lastUsedAt: null,
        archived: false,
      },
      {
        key: "food-11",
        name: "プレーンヨーグルト",
        category: "乳製品",
        ids: [11],
        useCount: 0,
        lastUsedAt: null,
        archived: false,
      },
      {
        key: "food-12",
        name: "ギリシャヨーグルト",
        category: "乳製品",
        ids: [12],
        useCount: 0,
        lastUsedAt: null,
        archived: false,
      },
    ],
  );
  assert.deepEqual(Object.keys(groups[0]), [
    "key",
    "name",
    "category",
    "foods",
    "useCount",
    "lastUsedAt",
    "archived",
  ]);
});

test("foodGroups.groupFoods: 行の中のバリアントは 使った回数 → 塩分の低い順（未確認は最後）→ バリアント名", () => {
  // 使った回数が同じ 3 つ。塩分も同じなので、バリアント名（ja）の あ < い < う
  const sameSalt = groupFoods([
    foodFixture({ id: 41, variantGroupId: "g", variantLabel: "い" }),
    foodFixture({ id: 42, variantGroupId: "g", variantLabel: "あ" }),
    foodFixture({ id: 43, variantGroupId: "g", variantLabel: "う" }),
  ]);
  assert.deepEqual(
    sameSalt[0].foods.map((food) => food.id),
    [42, 41, 43],
  );
  // 回数が違えば多いほうが先。回数が同じなら塩分の低いほう、未確認は最後
  const mixed = groupFoods([
    foodFixture({
      id: 51,
      variantGroupId: "h",
      variantLabel: "全量",
      useCount: 2,
      per: { ...foodFixture().per, saltG: 10 },
    }),
    foodFixture({
      id: 52,
      variantGroupId: "h",
      variantLabel: "つゆ残し",
      useCount: 2,
      per: { ...foodFixture().per, saltG: 6.5 },
    }),
    foodFixture({
      id: 53,
      variantGroupId: "h",
      variantLabel: "不明",
      useCount: 2,
      per: { ...foodFixture().per, saltG: null },
    }),
    foodFixture({
      id: 54,
      variantGroupId: "h",
      variantLabel: "よく食べる",
      useCount: 5,
      per: { ...foodFixture().per, saltG: 20 },
    }),
  ]);
  assert.deepEqual(
    mixed[0].foods.map((food) => food.id),
    [54, 52, 51, 53],
  );
});

test("foodGroups.groupFoods: 最後に使った日時は新しいほう、在庫切れは全部が在庫切れのときだけ", () => {
  const mixed = groupFoods([
    foodFixture({
      id: 41,
      variantGroupId: "g",
      variantLabel: "い",
      useCount: 1,
      lastUsedAt: "2026-09-01T10:00",
      archived: true,
    }),
    foodFixture({
      id: 42,
      variantGroupId: "g",
      variantLabel: "あ",
      useCount: 1,
      lastUsedAt: "2026-09-03T10:00",
      archived: true,
    }),
    foodFixture({
      id: 43,
      variantGroupId: "g",
      variantLabel: "う",
      useCount: 1,
      lastUsedAt: null,
      archived: false,
    }),
  ]);
  assert.equal(mixed[0].useCount, 3);
  assert.equal(mixed[0].lastUsedAt, "2026-09-03T10:00");
  assert.equal(mixed[0].archived, false);

  const allArchived = groupFoods([
    foodFixture({ id: 41, variantGroupId: "g", archived: true }),
    foodFixture({ id: 42, variantGroupId: "g", archived: true }),
  ]);
  assert.equal(allArchived[0].archived, true);
});

function groupFixture(
  key: string,
  name: string,
  useCount: number,
  lastUsedAt: string | null,
): FoodGroup {
  return {
    key,
    name,
    category: "その他",
    foods: [],
    useCount,
    lastUsedAt,
    archived: false,
  };
}

test("foodGroups.sortByFrequency: 使った回数の多い順 → 最後に使った日時の新しい順（無いものは最後）→ 名前順。元の配列は動かさない", () => {
  const groups = [
    groupFixture("a", "ア", 2, "2026-09-01T00:00"),
    groupFixture("b", "イ", 2, "2026-09-02T00:00"),
    groupFixture("c", "ウ", 2, null),
    groupFixture("d", "エ", 5, null),
    groupFixture("e", "ウ", 2, null),
    groupFixture("f", "ア", 2, "2026-09-02T00:00"),
  ];
  assert.deepEqual(
    sortByFrequency(groups).map((group) => group.key),
    ["d", "f", "b", "a", "c", "e"],
  );
  assert.deepEqual(
    groups.map((group) => group.key),
    ["a", "b", "c", "d", "e", "f"],
  );
});

test("foodGroups.groupFoods: 行のキーと行の中の並びは、テキスト記録（quickText）の groupKeyOf / sortVariants と同じ", () => {
  const catalog = catalogFixture();
  for (const group of groupFoods(catalog)) {
    const members = catalog.filter((food) => groupKeyOf(food) === group.key);
    assert.deepEqual(
      group.foods.map((food) => food.id),
      sortVariants(members).map((food) => food.id),
      group.key,
    );
  }
});
