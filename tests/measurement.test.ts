/**
 * 体組成の測定条件の評価（lib/measurement.ts）の今の出力を固定する特性テスト。
 *
 * 「前日にトレをしたか」ではなく「最後のトレから何日空いたか」で判定する。同じ日のトレでも
 * 測定時刻より後に実施したものは数えない。日数は論理日付（朝 4 時境界）の差。値は架空のサンプル。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateConditions,
  lastTrainingBefore,
} from "../src/lib/measurement.ts";
import type { TrainingSession } from "../src/db/types.ts";

function session(id: number, startedAt: string): TrainingSession {
  return {
    id,
    menu: "A",
    startedAt,
    startedAtIsEstimated: false,
    logDate: startedAt.slice(0, 10),
    note: "",
  };
}

const sessions = [
  session(1, "2026-09-11T19:00"),
  session(2, "2026-09-14T19:00"),
  session(3, "2026-09-17T20:00"),
  session(4, "2026-09-20T07:00"),
];

function input(
  overrides: {
    measuredAt?: string;
    previousDaySaltG?: number | null;
    hoursSinceLastMeal?: number | null;
    note?: string;
  } = {},
) {
  return {
    measuredAt: "2026-09-21T08:00",
    previousDaySaltG: 2.5,
    hoursSinceLastMeal: 3,
    ...overrides,
  };
}

test("measurement.lastTrainingBefore: 測定時刻より前に始めた最後のトレ（同時刻は含まない）", () => {
  assert.equal(lastTrainingBefore(sessions, "2026-09-20T08:00")?.id, 4);
  assert.equal(lastTrainingBefore(sessions, "2026-09-20T07:00")?.id, 3);
  assert.equal(lastTrainingBefore(sessions, "2026-09-11T19:00"), null);
  assert.equal(lastTrainingBefore([], "2026-09-20T08:00"), null);
  // 並びが古い順でなくても最後を選ぶ
  assert.equal(
    lastTrainingBefore(
      [sessions[2], sessions[0], sessions[1]],
      "2026-09-30T00:00",
    )?.id,
    3,
  );
});

test("measurement.evaluateConditions: 3 日以上空いて塩分・食後時間も問題なければ警告なし", () => {
  assert.deepEqual(evaluateConditions(input(), sessions.slice(0, 3)), {
    conditions: {
      previousDaySaltG: 2.5,
      lastTrainingAt: "2026-09-17T20:00",
      daysSinceLastTraining: 4,
      hoursSinceLastMeal: 3,
      note: "",
    },
    warnings: [],
  });
});

test("measurement.evaluateConditions: 最後のトレから 3 日未満なら警告（日数は論理日付の差）", () => {
  const result = evaluateConditions(input(), sessions);
  assert.equal(result.conditions.daysSinceLastTraining, 1);
  assert.deepEqual(result.warnings, [
    {
      code: "training_gap_lt3",
      severity: "high",
      message:
        "最後のトレーニングから1日です（3日以上空けたい条件）。水分で重く出ます",
    },
  ]);
  // 朝 3:30 の測定は前日（9/20）の扱いなので、9/20 の 7:00 のトレから 0 日
  const early = evaluateConditions(input({ measuredAt: "2026-09-21T03:30" }), [
    session(9, "2026-09-20T07:00"),
  ]);
  assert.equal(early.conditions.daysSinceLastTraining, 0);
  assert.deepEqual(
    early.warnings.map((warning) => warning.code),
    ["training_gap_lt3"],
  );
});

test("measurement.evaluateConditions: 同じ日でも測定より後のトレは数えない。トレが無ければ日数は null", () => {
  const after = evaluateConditions(input({ measuredAt: "2026-09-20T06:00" }), [
    session(9, "2026-09-20T07:00"),
  ]);
  assert.equal(after.conditions.lastTrainingAt, null);
  assert.equal(after.conditions.daysSinceLastTraining, null);
  assert.deepEqual(after.warnings, []);

  const none = evaluateConditions(input({ note: "朝一" }), []);
  assert.deepEqual(none.conditions, {
    previousDaySaltG: 2.5,
    lastTrainingAt: null,
    daysSinceLastTraining: null,
    hoursSinceLastMeal: 3,
    note: "朝一",
  });
});

test("measurement.evaluateConditions: 前日の塩分は 3g を超えたら警告（3g ちょうどは警告なし）", () => {
  const high = evaluateConditions(input({ previousDaySaltG: 3.1 }), []);
  assert.deepEqual(high.warnings, [
    {
      code: "previous_day_high_salt",
      severity: "high",
      message: "前日の塩分が3.1gです（測定前はパターンC 2〜3gが条件）",
    },
  ]);
  assert.deepEqual(
    evaluateConditions(input({ previousDaySaltG: 3 }), []).warnings,
    [],
  );
});

test("measurement.evaluateConditions: 食後の経過時間（未記録は info、2 時間未満は medium、2 時間ちょうどは警告なし）", () => {
  const unknown = evaluateConditions(
    input({ previousDaySaltG: null, hoursSinceLastMeal: null }),
    [],
  );
  assert.deepEqual(unknown.conditions.previousDaySaltG, null);
  assert.deepEqual(unknown.warnings, [
    {
      code: "meal_timing_unknown",
      severity: "info",
      message: "直前の食事からの経過時間が未記録です",
    },
  ]);
  assert.deepEqual(
    evaluateConditions(input({ hoursSinceLastMeal: 1.5 }), []).warnings,
    [
      {
        code: "meal_too_recent",
        severity: "medium",
        message: "食後1.5時間です（目安は2〜3時間）",
      },
    ],
  );
  assert.deepEqual(
    evaluateConditions(input({ hoursSinceLastMeal: 2 }), []).warnings,
    [],
  );
});

test("measurement.evaluateConditions: 条件の既定（3 日・塩分 3g・食後 2 時間）はオプションで変えられ、警告は日数 → 塩分 → 食後の順", () => {
  const result = evaluateConditions(
    input({ previousDaySaltG: 1.5, hoursSinceLastMeal: 3 }),
    sessions.slice(0, 3),
    { minRestDays: 5, previousDaySaltLimitG: 1, minHoursAfterMeal: 4 },
  );
  assert.deepEqual(result.warnings, [
    {
      code: "training_gap_lt3",
      severity: "high",
      message:
        "最後のトレーニングから4日です（5日以上空けたい条件）。水分で重く出ます",
    },
    {
      code: "previous_day_high_salt",
      severity: "high",
      message: "前日の塩分が1.5gです（測定前はパターンC 2〜3gが条件）",
    },
    {
      code: "meal_too_recent",
      severity: "medium",
      message: "食後3時間です（目安は2〜3時間）",
    },
  ]);
});
