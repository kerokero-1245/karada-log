/**
 * 配列まわりの小さな共通処理（lib/collections.ts の idsOf / groupBy）。
 *
 * groupBy の Map は「最初に現れた順」に並び、各グループの中は元の並びのまま。
 * 書き出しの週合計の行・日ごとのまとめ・候補の並びは、この順がそのまま出力になる。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupBy, idsOf } from "../src/lib/collections.ts";

test("collections.idsOf: id が付いている行の id を元の順に並べる。保存前の行（id なし）は飛ばす", () => {
  assert.deepEqual(
    idsOf([{ id: 3 }, { id: undefined }, { id: 1 }, {}, { id: 2 }]),
    [3, 1, 2],
  );
  assert.deepEqual(idsOf([]), []);
  assert.deepEqual(idsOf([{}, { id: undefined }]), []);
  // id 0 は「ある」として残す
  assert.deepEqual(idsOf([{ id: 0 }]), [0]);
});

test("collections.idsOf: ほかの項目を持つ行でも使える（元の配列は変えない）", () => {
  const rows = [
    { id: 7, name: "a" },
    { id: undefined, name: "b" },
  ];
  assert.deepEqual(idsOf(rows), [7]);
  assert.equal(rows.length, 2);
});

test("collections.groupBy: キーは最初に現れた順、グループの中は元の並び", () => {
  const groups = groupBy(
    [
      { week: "9/21", day: "月" },
      { week: "9/28", day: "月" },
      { week: "9/21", day: "火" },
      { week: "9/14", day: "日" },
      { week: "9/28", day: "火" },
    ],
    (row) => row.week,
  );
  assert.deepEqual([...groups.keys()], ["9/21", "9/28", "9/14"]);
  assert.deepEqual(
    [...groups].map(([week, rows]) => [week, rows.map((row) => row.day)]),
    [
      ["9/21", ["月", "火"]],
      ["9/28", ["月", "火"]],
      ["9/14", ["日"]],
    ],
  );
});

test("collections.groupBy: 数値のキー・空の配列・1 件だけ・元の配列を書き換えない", () => {
  assert.equal(groupBy([], (value: number) => value).size, 0);
  const input = [10, 20, 11, 21, 30];
  const byTens = groupBy(input, (value) => Math.floor(value / 10));
  assert.deepEqual(
    [...byTens],
    [
      [1, [10, 11]],
      [2, [20, 21]],
      [3, [30]],
    ],
  );
  assert.deepEqual(input, [10, 20, 11, 21, 30]);
  // グループの配列は入力とは別の配列（あとから並べ替えても入力は動かない）
  const same = groupBy(input, () => "all");
  assert.notEqual(same.get("all"), input);
  same.get("all")?.sort((a, b) => b - a);
  assert.deepEqual(input, [10, 20, 11, 21, 30]);
});
