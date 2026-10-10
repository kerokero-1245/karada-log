/**
 * F4 の進捗ルール（lib/progression.ts）のうち、progression.test.ts がまだ見ていない部分の今の出力を
 * 固定する特性テスト。規定値の決め方（回数・秒数・限界まで）と、判定の表示（時間ベース・ダンベル・
 * 増分 0・限界まで）、増分を当てない場合の次回の設定。値は架空のサンプル。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TARGET_REPS,
  describeJudgement,
  setValue,
  suggestNext,
  targetValue,
} from "../src/lib/progression.ts";
import type { JudgeTarget } from "../src/lib/progression.ts";
import type { ExerciseTarget, Progression } from "../src/db/types.ts";

const barbell: ExerciseTarget = {
  load: { style: "barbell", barType: "short", plateKgPerSide: 12.5 },
  reps: 10,
  seconds: null,
};
const dumbbell: ExerciseTarget = {
  load: { style: "dumbbell", kgPerHand: 16, hands: 2 },
  reps: 10,
  seconds: null,
};
const timed: ExerciseTarget = {
  load: { style: "dumbbell", kgPerHand: 16, hands: 2 },
  reps: null,
  seconds: 40,
};
const weightUp: Progression = { metric: "weight", amount: 2.5, basis: "total" };
const secondsUp: Progression = { metric: "seconds", amount: 5, basis: "total" };
const perHand: Progression = { metric: "weight", amount: 2, basis: "perHand" };

test("progression: 規定回数の既定は 10", () => {
  assert.equal(DEFAULT_TARGET_REPS, 10);
});

test("progression.setValue / targetValue: 時間ベースは秒数、限界までは規定値なし、回数が無ければ既定の 10", () => {
  assert.equal(setValue({ reps: 5, seconds: 30 }, "timed"), 30);
  assert.equal(setValue({ reps: 5, seconds: 30 }, "weight_reps"), 5);
  assert.equal(setValue({ reps: 5, seconds: 30 }, "amrap"), 5);

  const timedTarget: JudgeTarget = {
    kind: "timed",
    sets: 3,
    reps: null,
    seconds: 40,
  };
  const repsTarget: JudgeTarget = {
    kind: "weight_reps",
    sets: 3,
    reps: null,
    seconds: null,
  };
  assert.equal(targetValue(timedTarget), 40);
  assert.equal(targetValue({ ...timedTarget, kind: "amrap" }), null);
  assert.equal(targetValue(repsTarget), 10);
  assert.equal(targetValue({ ...repsTarget, reps: 8 }), 8);
});

test("progression.describeJudgement: 重量の種目（達成・据え置き・判定なし・増分 0）", () => {
  assert.equal(
    describeJudgement("achieved", weightUp, barbell, "weight_reps"),
    "次回 +2.5kg（37.5kg）",
  );
  assert.equal(
    describeJudgement("held", weightUp, barbell, "weight_reps"),
    "据え置き（次回も 35kg）",
  );
  assert.equal(
    describeJudgement("held", weightUp, dumbbell, "weight_reps"),
    "据え置き（次回も 16kg×2）",
  );
  assert.equal(
    describeJudgement("unknown", weightUp, barbell, "weight_reps"),
    "セットを入れると判定します",
  );
  assert.equal(
    describeJudgement("achieved", null, barbell, "weight_reps"),
    "規定に届きました（増分が 0 なので次回も同じ設定）",
  );
});

test("progression.describeJudgement: ダンベルの片手基準・時間ベース・限界までの言い方", () => {
  assert.equal(
    describeJudgement("achieved", perHand, dumbbell, "weight_reps"),
    "次回 +2kg（片側）（18kg×2）",
  );
  assert.equal(
    describeJudgement("achieved", secondsUp, timed, "timed"),
    "次回 +5秒（45秒）",
  );
  assert.equal(
    describeJudgement("held", secondsUp, timed, "timed"),
    "据え置き（次回も 40秒）",
  );
  assert.equal(
    describeJudgement("held", secondsUp, { ...timed, seconds: null }, "timed"),
    "据え置き（次回も —秒）",
  );
  // 限界までの種目は、判定の結果に関わらずこの言い方
  assert.equal(
    describeJudgement("achieved", weightUp, barbell, "amrap"),
    "限界までの種目なので判定はしません",
  );
});

test("progression.suggestNext: 増分が無い・達成でないときは今回と同じ設定（コピーを返す）。マシンは総重量に足す", () => {
  assert.deepEqual(suggestNext(barbell, "achieved", null), barbell);
  assert.notEqual(suggestNext(barbell, "achieved", null), barbell);
  assert.deepEqual(suggestNext(barbell, "unknown", weightUp), barbell);
  assert.deepEqual(
    suggestNext(
      { load: { style: "machine", stackKg: 80 }, reps: 10, seconds: null },
      "achieved",
      weightUp,
    ),
    { load: { style: "machine", stackKg: 82.5 }, reps: 10, seconds: null },
  );
});
