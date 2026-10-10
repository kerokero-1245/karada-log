/**
 * 重量の表現（lib/weight.ts）。
 *
 * EZバー(7kg) とショートバー(10kg) の取り違え事故があった（handover §10-③）。
 * 総重量は「バー種別 + プレート片側 × 2」から毎回計算し、内訳を必ず出す（原則2）。
 * 値は架空のサンプル。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyProgression,
  describeLoad,
  totalWeightKg,
  trackedWeightKg,
} from "../src/lib/weight.ts";
import type { LoadSpec } from "../src/db/types.ts";

test("バーベルの総重量 = バー重量 + プレート片側 × 2（ショートバー 10kg）", () => {
  assert.equal(
    totalWeightKg({ style: "barbell", barType: "short", plateKgPerSide: 10 }),
    30,
  );
});

test("同じプレートでもバー種別で総重量が変わる（EZバー 7kg）", () => {
  assert.equal(
    totalWeightKg({ style: "barbell", barType: "ez", plateKgPerSide: 10 }),
    27,
  );
});

test("プレート 0 ならバーだけの重量", () => {
  assert.equal(
    totalWeightKg({ style: "barbell", barType: "ez", plateKgPerSide: 0 }),
    7,
  );
});

test("内訳つきの表示にバー種別とプレートが出る", () => {
  assert.equal(
    describeLoad({ style: "barbell", barType: "short", plateKgPerSide: 12.5 }),
    "35kg（ショートバー10kg + 12.5kg×2）",
  );
  assert.equal(
    describeLoad({ style: "barbell", barType: "ez", plateKgPerSide: 2.5 }),
    "12kg（EZバー7kg + 2.5kg×2）",
  );
});

test("ダンベルは総重量が両手の和、進捗は片手の重量で追う", () => {
  const load: LoadSpec = { style: "dumbbell", kgPerHand: 8, hands: 2 };
  assert.equal(totalWeightKg(load), 16);
  assert.equal(trackedWeightKg(load), 8);
});

test("マシンは積んだ重量そのもの、自重は加重が無ければ null", () => {
  assert.equal(totalWeightKg({ style: "machine", stackKg: 80 }), 80);
  assert.equal(totalWeightKg({ style: "bodyweight", addedKg: null }), null);
});

test("増分はバー種別を変えずにプレートへ振り分ける（+2.5kg → 片側 +1.25kg）", () => {
  const next = applyProgression(
    { style: "barbell", barType: "ez", plateKgPerSide: 2.5 },
    { metric: "weight", amount: 2.5, basis: "total" },
  );
  assert.deepEqual(next, {
    style: "barbell",
    barType: "ez",
    plateKgPerSide: 3.75,
  });
  assert.equal(totalWeightKg(next), 14.5);
});
