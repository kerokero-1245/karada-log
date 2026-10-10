/**
 * 重量の表現（lib/weight.ts）のうち、weight.test.ts がまだ見ていない部分の今の出力を固定する特性テスト。
 *
 * バー種別 + プレート以外の重量（ダンベル・マシン・構成未確認・自重）の総重量・追う値・内訳の表示と、
 * 次回の重量を 1 段階上げる計算（丸めは小数第 2 位）、増分の表示。値は架空のサンプル。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyProgression,
  applySecondsProgression,
  describeLoad,
  describeLoadShort,
  describeProgression,
  totalWeightKg,
  trackedWeightKg,
} from "../src/lib/weight.ts";
import type { LoadSpec, Progression } from "../src/db/types.ts";

const LOADS: Record<string, LoadSpec> = {
  ez: { style: "barbell", barType: "ez", plateKgPerSide: 2.5 },
  short: { style: "barbell", barType: "short", plateKgPerSide: 12.5 },
  dumbbell2: { style: "dumbbell", kgPerHand: 16, hands: 2 },
  dumbbell1: { style: "dumbbell", kgPerHand: 14, hands: 1 },
  machine: { style: "machine", stackKg: 80 },
  other: { style: "other", totalKg: 20, description: "構成未確認" },
  bodyweight: { style: "bodyweight", addedKg: null },
  weighted: { style: "bodyweight", addedKg: 5 },
  zero: { style: "bodyweight", addedKg: 0 },
};

function progression(
  metric: Progression["metric"],
  amount: number,
  basis: Progression["basis"] = "total",
): Progression {
  return { metric, amount, basis };
}

test("weight: 重量の種類ごとの総重量・追う値・内訳・短い表示", () => {
  const expectations: Record<
    string,
    {
      total: number | null;
      tracked: number | null;
      describe: string;
      short: string;
    }
  > = {
    ez: {
      total: 12,
      tracked: 12,
      describe: "12kg（EZバー7kg + 2.5kg×2）",
      short: "12kg",
    },
    short: {
      total: 35,
      tracked: 35,
      describe: "35kg（ショートバー10kg + 12.5kg×2）",
      short: "35kg",
    },
    // ダンベルの総重量は両手の和、進捗は片手で追う
    dumbbell2: {
      total: 32,
      tracked: 16,
      describe: "16kg×2（ダンベル 片手16kg / 計32kg）",
      short: "16kg×2",
    },
    dumbbell1: {
      total: 14,
      tracked: 14,
      describe: "14kg×1（ダンベル 片手14kg / 計14kg）",
      short: "14kg×1",
    },
    machine: {
      total: 80,
      tracked: 80,
      describe: "80kg（マシン）",
      short: "80kg",
    },
    other: {
      total: 20,
      tracked: 20,
      describe: "20kg（構成未確認）",
      short: "20kg",
    },
    // 自重は加重が無ければ重量なし、加重 0 も「自重」とだけ書く
    bodyweight: { total: null, tracked: null, describe: "自重", short: "自重" },
    weighted: {
      total: 5,
      tracked: 5,
      describe: "自重 + 5kg",
      short: "自重+5kg",
    },
    zero: { total: 0, tracked: 0, describe: "自重", short: "自重" },
  };
  for (const [name, expected] of Object.entries(expectations)) {
    const load = LOADS[name];
    assert.deepEqual(
      {
        total: totalWeightKg(load),
        tracked: trackedWeightKg(load),
        describe: describeLoad(load),
        short: describeLoadShort(load),
      },
      expected,
      name,
    );
  }
});

test("weight.applyProgression: 総重量 +3.5kg を種類ごとに振り分ける（バー種別は変えない、丸めは小数第 2 位）", () => {
  const plus = progression("weight", 3.5);
  assert.deepEqual(applyProgression(LOADS.ez, plus), {
    style: "barbell",
    barType: "ez",
    plateKgPerSide: 4.25,
  });
  assert.deepEqual(applyProgression(LOADS.short, plus), {
    style: "barbell",
    barType: "short",
    plateKgPerSide: 14.25,
  });
  // ダンベルは総重量の増分を手の数で割る
  assert.deepEqual(applyProgression(LOADS.dumbbell2, plus), {
    style: "dumbbell",
    kgPerHand: 17.75,
    hands: 2,
  });
  assert.deepEqual(applyProgression(LOADS.dumbbell1, plus), {
    style: "dumbbell",
    kgPerHand: 17.5,
    hands: 1,
  });
  assert.deepEqual(applyProgression(LOADS.machine, plus), {
    style: "machine",
    stackKg: 83.5,
  });
  assert.deepEqual(applyProgression(LOADS.other, plus), {
    style: "other",
    totalKg: 23.5,
    description: "構成未確認",
  });
  // 自重は変えない
  assert.deepEqual(applyProgression(LOADS.bodyweight, plus), LOADS.bodyweight);
  assert.deepEqual(applyProgression(LOADS.weighted, plus), LOADS.weighted);
});

test("weight.applyProgression: ダンベルの片手基準は増分をそのまま片手に足す。増分なし・秒数の増分では変えない", () => {
  assert.deepEqual(
    applyProgression(LOADS.dumbbell2, progression("weight", 2, "perHand")),
    { style: "dumbbell", kgPerHand: 18, hands: 2 },
  );
  assert.deepEqual(
    applyProgression(LOADS.dumbbell2, progression("weight", 4)),
    { style: "dumbbell", kgPerHand: 18, hands: 2 },
  );
  assert.equal(applyProgression(LOADS.machine, null), LOADS.machine);
  assert.equal(
    applyProgression(LOADS.machine, progression("seconds", 5)),
    LOADS.machine,
  );
});

test("weight.applySecondsProgression: 秒数の増分だけ足す。秒数が無い・増分が秒数でなければそのまま", () => {
  assert.equal(applySecondsProgression(40, progression("seconds", 5)), 45);
  assert.equal(applySecondsProgression(null, progression("seconds", 5)), null);
  assert.equal(applySecondsProgression(40, null), 40);
  assert.equal(applySecondsProgression(40, progression("weight", 5)), 40);
});

test("weight.describeProgression: 増分の表示（なし・秒・片側・総重量）", () => {
  assert.equal(describeProgression(null), "—");
  assert.equal(describeProgression(progression("seconds", 5)), "+5秒");
  assert.equal(
    describeProgression(progression("weight", 2, "perHand")),
    "+2kg（片側）",
  );
  assert.equal(describeProgression(progression("weight", 2.5)), "+2.5kg");
});
