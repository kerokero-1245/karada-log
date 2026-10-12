/**
 * 構成が分からない重量（総重量だけ）をバーベルの内訳に直す（lib/weight.ts の toBarbell）。
 *
 * 保存される LoadSpec を決める（重量はバー種別とセット。原則 2）。
 * プレートは片側 =（総重量 − バーの重さ）÷ 2。バーより軽いときは 0。値は架空のサンプル。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { totalWeightKg, toBarbell } from "../src/lib/weight.ts";

test("weight.toBarbell: EZバー（7kg）・ショートバー（10kg）のそれぞれで、片側のプレートを求める", () => {
  assert.deepEqual(toBarbell(40, "ez"), {
    style: "barbell",
    barType: "ez",
    plateKgPerSide: 16.5,
  });
  assert.deepEqual(toBarbell(40, "short"), {
    style: "barbell",
    barType: "short",
    plateKgPerSide: 15,
  });
});

test("weight.toBarbell: 小数第 2 位で丸める。バーより軽いときは 0（負にしない）", () => {
  assert.deepEqual(toBarbell(12.3, "ez"), {
    style: "barbell",
    barType: "ez",
    plateKgPerSide: 2.65,
  });
  assert.deepEqual(toBarbell(10.01, "short"), {
    style: "barbell",
    barType: "short",
    plateKgPerSide: 0,
  });
  assert.deepEqual(toBarbell(5, "ez"), {
    style: "barbell",
    barType: "ez",
    plateKgPerSide: 0,
  });
  assert.deepEqual(toBarbell(7, "ez"), {
    style: "barbell",
    barType: "ez",
    plateKgPerSide: 0,
  });
});

test("weight.toBarbell: 内訳から総重量を計算し直すと、元の総重量に戻る（プレートが 0 に切られないとき）", () => {
  for (const total of [20, 35, 40, 52.5, 60.5]) {
    assert.equal(totalWeightKg(toBarbell(total, "ez")), total);
    assert.equal(totalWeightKg(toBarbell(total, "short")), total);
  }
});
