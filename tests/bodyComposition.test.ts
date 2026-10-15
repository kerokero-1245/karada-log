/**
 * 体組成・骨密度の画面に出すもの（lib/bodyComposition.ts）。値は架空のサンプル。
 *
 *  - 機種が違う測定は同じグラフに並べない（機種ごとに分ける。表記の前後の空白は同じ機種とみなす）
 *  - グラフの主役は脂肪量と除脂肪量。目標ラインは設定（Settings.goal）から取る
 *  - 条件が悪い測定（警告が high / medium）は白抜きの点と「⚠」で区別する。未記録（info）だけなら悪いとしない
 *  - 一覧は新しい順
 *  - フォームは空欄を null で保存し（0 で埋めない）、範囲外・必須の欠けは保存しない
 *  - 測定条件は「最後のトレからの日数」で、測定時刻より後のトレは数えない（lib/measurement.ts を使う）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bodyTrend,
  buildBodyComposition,
  buildBoneDensity,
  emptyBodyForm,
  emptyBoneForm,
  formatMeasure,
  groupByDevice,
  isPoorCondition,
  sortNewestFirst,
} from "../src/lib/bodyComposition.ts";
import type { BodyComposition, MeasurementWarning } from "../src/db/types.ts";
import { SEGMENT_KEYS } from "../src/db/types.ts";
import { bodyFixture, sessionFixture, settingsFixture } from "./helpers.ts";

const gap: MeasurementWarning = {
  code: "training_gap_lt3",
  severity: "high",
  message: "最後のトレーニングから1日です",
};
const unknownMeal: MeasurementWarning = {
  code: "meal_timing_unknown",
  severity: "info",
  message: "直前の食事からの経過時間が未記録です",
};

function body(
  id: number,
  measuredAt: string,
  overrides: Partial<BodyComposition> = {},
): BodyComposition {
  return bodyFixture({ id, measuredAt, ...overrides });
}

test("bodyComposition.isPoorCondition: high / medium の警告があれば悪い条件。info だけなら悪くない", () => {
  assert.equal(isPoorCondition(body(1, "2026-09-20T08:00")), false);
  assert.equal(
    isPoorCondition(body(1, "2026-09-20T08:00", { warnings: [unknownMeal] })),
    false,
  );
  assert.equal(
    isPoorCondition(body(1, "2026-09-20T08:00", { warnings: [gap] })),
    true,
  );
  assert.equal(
    isPoorCondition(
      body(1, "2026-09-20T08:00", {
        warnings: [
          { ...unknownMeal, code: "meal_too_recent", severity: "medium" },
        ],
      }),
    ),
    true,
  );
});

test("bodyComposition.sortNewestFirst: 測定日時の新しい順。同じ日時は id の大きい順。元の配列は変えない", () => {
  const rows = [
    body(1, "2026-09-15T10:10"),
    body(2, "2026-10-01T08:00"),
    body(3, "2026-09-20T09:00"),
    body(4, "2026-10-01T08:00"),
  ];
  assert.deepEqual(
    sortNewestFirst(rows).map((r) => r.id),
    [4, 2, 3, 1],
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    [1, 2, 3, 4],
  );
});

test("bodyComposition.groupByDevice: 機種ごとに分けて古い順。並びは最新の測定が新しい機種から。前後の空白は同じ機種", () => {
  const rows = [
    body(1, "2026-09-15T10:10", { device: "TANITA MC-980" }),
    body(2, "2026-09-25T10:00", { device: "InBody 270" }),
    body(3, "2026-10-05T10:00", { device: " TANITA MC-980 " }),
    body(4, "2026-09-01T10:00", { device: "TANITA MC-980" }),
  ];
  const groups = groupByDevice(rows);
  assert.deepEqual(
    groups.map((g) => [g.device, g.rows.map((r) => r.id)]),
    [
      ["TANITA MC-980", [4, 1, 3]],
      ["InBody 270", [2]],
    ],
  );
  assert.deepEqual(groupByDevice([]), []);
});

test("bodyComposition.bodyTrend: 脂肪量・除脂肪量の点と目標ライン。値の無い回は飛ばし、悪い条件の回は白抜き", () => {
  const goal = settingsFixture().goal;
  const rows = [
    body(1, "2026-09-15T10:10", { fatMassKg: 14, warnings: [gap] }),
    body(2, "2026-09-25T10:00", { fatMassKg: null }),
    body(3, "2026-10-05T07:30", { fatMassKg: 13.5, place: "" }),
  ];
  const fat = bodyTrend(rows, "fatMassKg", goal);
  assert.equal(fat.title, "脂肪量の推移");
  assert.equal(fat.unit, "kg");
  assert.deepEqual(fat.reference, { value: 12, label: "目標（年末）12kg" });
  assert.deepEqual(fat.points, [
    {
      label: "9/15（火）",
      value: 14,
      filled: false,
      detail: "10:10 ジム",
      status: "⚠ 条件が悪い",
    },
    {
      label: "10/5（月）",
      value: 13.5,
      filled: true,
      detail: "07:30",
      status: "",
    },
  ]);

  const lean = bodyTrend(rows, "leanMassKg", goal);
  assert.equal(lean.title, "除脂肪量の推移");
  assert.deepEqual(lean.reference, { value: 55, label: "目標（年末）55kg" });
  assert.deepEqual(
    lean.points.map((p) => p.value),
    [57.05, 57.05, 57.05],
  );
});

test("bodyComposition.formatMeasure: 未確認は —、kcal は桁区切りの整数、ほかは小数第 2 位まで", () => {
  assert.equal(formatMeasure(null, "kg"), "—");
  assert.equal(formatMeasure(13.5, "kg"), "13.5kg");
  assert.equal(formatMeasure(1610, "kcal"), "1,610kcal");
  assert.equal(formatMeasure(8, ""), "8");
});

/* フォーム ----------------------------------------------------------- */

function filledForm() {
  const values = emptyBodyForm("2026-10-05T07:30", null);
  values.device = "TANITA MC-980";
  values.place = "ジム";
  values.weightKg = "70.4";
  values.bodyFatPercent = "19.2";
  values.fatMassKg = "13.5";
  values.leanMassKg = "56.9";
  values.muscleMassKg = "53.8";
  values.appendicularMuscleKg = "25.9";
  values.bmrKcal = "1610";
  values.visceralFatLevel = "8";
  values.segments.trunk = {
    muscleKg: "27.1",
    fatKg: "7.6",
    fatPercent: "21.5",
  };
  values.previousDaySaltG = "2.4";
  values.hoursSinceLastMeal = "3";
  return values;
}

test("bodyComposition.emptyBodyForm: 機種と場所は前回の測定から引き継ぎ、数値は空欄", () => {
  const empty = emptyBodyForm("2026-10-05T07:30", null);
  assert.equal(empty.measuredAt, "2026-10-05T07:30");
  assert.equal(empty.device, "");
  assert.equal(empty.fatMassKg, "");
  assert.deepEqual(Object.keys(empty.segments), SEGMENT_KEYS);
  const next = emptyBodyForm(
    "2026-10-05T07:30",
    body(1, "2026-09-15T10:10", { device: "InBody 270", place: "体育館" }),
  );
  assert.equal(next.device, "InBody 270");
  assert.equal(next.place, "体育館");
  assert.equal(next.weightKg, "");
});

test("bodyComposition.buildBodyComposition: 入力を保存の形にする（空欄は null・前後の空白は落とす・測定条件を計算する）", () => {
  const values = filledForm();
  values.device = "  TANITA MC-980 ";
  const sessions = [
    sessionFixture({ id: 1, startedAt: "2026-10-01T19:00" }),
    // 測定より後のトレは数えない
    sessionFixture({ id: 2, startedAt: "2026-10-05T18:00" }),
  ];
  const result = buildBodyComposition(values, sessions, { minRestDays: 3 });
  assert.deepEqual(result.errors, []);
  const record = result.record;
  assert.ok(record);
  assert.equal(record.device, "TANITA MC-980");
  assert.equal(record.measuredAt, "2026-10-05T07:30");
  assert.equal(record.weightKg, 70.4);
  assert.equal(record.fatMassKg, 13.5);
  assert.equal(record.leanMassKg, 56.9);
  assert.equal(record.appendicularMuscleKg, 25.9);
  assert.equal(record.bmrKcal, 1610);
  assert.equal(record.visceralFatLevel, 8);
  assert.equal(record.bodyWaterKg, null);
  assert.deepEqual(record.segmentMuscle.trunk, { muscleKg: 27.1, score: null });
  assert.deepEqual(record.segmentFat.trunk, {
    fatKg: 7.6,
    fatPercent: 21.5,
    score: null,
  });
  assert.deepEqual(record.segmentMuscle.leftLeg, {
    muscleKg: null,
    score: null,
  });
  assert.equal(record.conditions.lastTrainingAt, "2026-10-01T19:00");
  assert.equal(record.conditions.daysSinceLastTraining, 4);
  assert.equal(record.conditions.previousDaySaltG, 2.4);
  assert.equal(record.conditions.hoursSinceLastMeal, 3);
  assert.deepEqual(record.warnings, []);
  assert.deepEqual(record.extra, {});
  // 保存の形のキーの並び（JSON バックアップの行のキー順）は型の並びと同じ
  assert.deepEqual(Object.keys(record), Object.keys(bodyFixture()).slice(1));
});

test("bodyComposition.buildBodyComposition: 3 日未満のトレは警告つきで保存できる（保存は止めない）", () => {
  const values = filledForm();
  const result = buildBodyComposition(
    values,
    [sessionFixture({ startedAt: "2026-10-03T19:00" })],
    { minRestDays: 3 },
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.conditions.daysSinceLastTraining, 2);
  assert.deepEqual(
    result.warnings.map((w) => w.code),
    ["training_gap_lt3"],
  );
  assert.ok(result.record);
  assert.equal(isPoorCondition(result.record), true);
});

test("bodyComposition.buildBodyComposition: 必須（測定日時・機種・脂肪量・除脂肪量）が欠けたら保存しない", () => {
  const values = emptyBodyForm("", null);
  const result = buildBodyComposition(values, [], { minRestDays: 3 });
  assert.equal(result.record, null);
  assert.deepEqual(result.errors, [
    "測定日時を入れてください",
    "機種を入れてください（機種ごとに分けてグラフにします）",
    "脂肪量を入れてください",
    "除脂肪量を入れてください",
  ]);
});

test("bodyComposition.buildBodyComposition: 数値でない・範囲の外は保存しない（部位別・測定条件も）", () => {
  const values = filledForm();
  values.weightKg = "7O";
  values.bodyFatPercent = "95";
  values.visceralFatLevel = "0";
  values.segments.rightArm.fatPercent = "-1";
  values.hoursSinceLastMeal = "100";
  const result = buildBodyComposition(values, [], { minRestDays: 3 });
  assert.equal(result.record, null);
  assert.deepEqual(result.errors, [
    "体重は数値で入れてください",
    "体脂肪率は1〜70%の範囲で入れてください",
    "内臓脂肪レベルは1〜59の範囲で入れてください",
    "右腕の脂肪率は0〜80%の範囲で入れてください",
    "食後経過時間は0〜48時間の範囲で入れてください",
  ]);
  // 境界の値は受け付ける
  const edge = filledForm();
  edge.bodyFatPercent = "70";
  edge.visceralFatLevel = "1";
  assert.deepEqual(
    buildBodyComposition(edge, [], { minRestDays: 3 }).errors,
    [],
  );
});

test("bodyComposition.buildBoneDensity: 骨密度の入力を保存の形にする。必須は測定日時と機種", () => {
  const values = emptyBoneForm("2026-10-05T07:20", null);
  values.device = " CM-200 ";
  values.place = "薬局";
  values.sosMps = "1540";
  values.yamPercent = "88";
  values.agePercent = "";
  values.rank = " b ";
  const result = buildBoneDensity(values);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.record, {
    measuredAt: "2026-10-05T07:20",
    place: "薬局",
    device: "CM-200",
    sosMps: 1540,
    yamPercent: 88,
    agePercent: null,
    rank: "B",
    heelTempC: null,
    deviceTempC: null,
    note: "",
  });

  const bad = emptyBoneForm("", null);
  bad.yamPercent = "300";
  const failed = buildBoneDensity(bad);
  assert.equal(failed.record, null);
  assert.deepEqual(failed.errors, [
    "測定日時を入れてください",
    "機種を入れてください（機種ごとに分けて並べます）",
    "%YAMは10〜200%の範囲で入れてください",
  ]);
});
