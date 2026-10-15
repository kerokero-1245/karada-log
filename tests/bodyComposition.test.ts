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
  BONE_REQUIRED_ONE,
  bodyTrend,
  buildBodyComposition,
  buildBoneDensity,
  emptyBodyForm,
  emptyBoneForm,
  formatMeasure,
  daysSinceTrainingText,
  groupByDevice,
  isFormChanged,
  isPoorCondition,
  normalizeDevice,
  sortNewestFirst,
  trainingStartNote,
  withCurrentConditions,
} from "../src/lib/bodyComposition.ts";
import { ESTIMATED_START_NOTE } from "../src/lib/format.ts";
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
  // 縦の範囲の最小幅（0.1kg の差が急落に見えないように 2kg より狭くしない）
  assert.equal(fat.minSpan, 2);
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
  const values = emptyBodyForm(null);
  values.measuredAt = "2026-10-05T07:30";
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

test("bodyComposition.emptyBodyForm: 測定日時は空で開く（今の時刻を入れない）。機種と場所は前回の測定から引き継ぎ、数値は空欄", () => {
  const empty = emptyBodyForm(null);
  assert.equal(empty.measuredAt, "");
  assert.equal(empty.device, "");
  assert.equal(empty.fatMassKg, "");
  assert.deepEqual(Object.keys(empty.segments), SEGMENT_KEYS);
  const next = emptyBodyForm(
    body(1, "2026-09-15T10:10", { device: "InBody 270", place: "体育館" }),
  );
  assert.equal(next.measuredAt, "");
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
  const values = emptyBodyForm(null);
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

test("bodyComposition.buildBoneDensity: 骨密度の入力を保存の形にする。必須は測定日時と機種（と、数値か判定ランクのどれか 1 つ）", () => {
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
    "機種を入れてください",
    "%YAMは10〜200%の範囲で入れてください",
  ]);
});

test("bodyComposition.buildBoneDensity: SOS・%YAM・%AGE・判定ランクがどれも空なら保存しない（どれか 1 つで保存できる）", () => {
  const values = emptyBoneForm("2026-10-05T07:20", null);
  values.device = "CM-200";
  const none = buildBoneDensity(values);
  assert.equal(none.record, null);
  assert.deepEqual(none.errors, [BONE_REQUIRED_ONE]);
  assert.equal(
    BONE_REQUIRED_ONE,
    "SOS・%YAM・%AGE・判定ランクのどれか 1 つを入れてください",
  );
  // 空白だけは空とみなす
  values.rank = "  ";
  assert.deepEqual(buildBoneDensity(values).errors, [BONE_REQUIRED_ONE]);
  for (const key of ["sosMps", "yamPercent", "agePercent", "rank"] as const) {
    const one = emptyBoneForm("2026-10-05T07:20", null);
    one.device = "CM-200";
    one[key] = key === "rank" ? "B" : key === "sosMps" ? "1540" : "88";
    assert.deepEqual(buildBoneDensity(one).errors, [], key);
  }
  // 範囲外の値だけなら、その欄のエラーだけを出す（「どれか 1 つ」は重ねない）
  const bad = emptyBoneForm("2026-10-05T07:20", null);
  bad.device = "CM-200";
  bad.yamPercent = "300";
  assert.deepEqual(buildBoneDensity(bad).errors, [
    "%YAMは10〜200%の範囲で入れてください",
  ]);
});

/* 機種名の照合・入力の確かめ ------------------------------------------- */

test("bodyComposition.normalizeDevice: 全角半角（NFKC）と連続する空白をそろえる。大文字小文字はそのまま", () => {
  assert.equal(normalizeDevice(" TANITA  MC-980 "), "TANITA MC-980");
  assert.equal(normalizeDevice("ＴＡＮＩＴＡ　ＭＣ－９８０"), "TANITA MC-980");
  assert.equal(normalizeDevice("TANITA\tMC-980"), "TANITA MC-980");
  assert.equal(normalizeDevice("tanita mc-980"), "tanita mc-980");
});

test("bodyComposition.groupByDevice: 全角・連続空白の表記ゆれは同じ機種にまとめる。保存されている値は書き換えない", () => {
  const rows = [
    body(1, "2026-09-15T10:10", { device: "TANITA MC-980" }),
    body(2, "2026-09-29T08:00", { device: "TANITA  MC-980" }),
    body(3, "2026-10-05T08:00", { device: "ＴＡＮＩＴＡ　ＭＣ－９８０" }),
    body(4, "2026-10-06T08:00", { device: "tanita mc-980" }),
  ];
  const groups = groupByDevice(rows);
  assert.deepEqual(
    groups.map((g) => [g.device, g.rows.map((r) => r.id)]),
    [
      ["tanita mc-980", [4]],
      ["TANITA MC-980", [1, 2, 3]],
    ],
  );
  assert.equal(groups[1].rows[1].device, "TANITA  MC-980");
  assert.equal(groups[1].rows[2].device, "ＴＡＮＩＴＡ　ＭＣ－９８０");
});

test("bodyComposition.buildBodyComposition: 脂肪量が体重×体脂肪率と、脂肪量+除脂肪量が体重と 1kg を超えて違えば確かめを出す（保存は止めない）", () => {
  // 70.4 × 19.2% = 13.52 / 13.5 + 56.9 = 70.4 → 確かめなし
  assert.deepEqual(
    buildBodyComposition(filledForm(), [], { minRestDays: 3 }).checks,
    [],
  );
  // 脂肪量と除脂肪量の取り違え
  const swapped = filledForm();
  swapped.fatMassKg = "56.9";
  swapped.leanMassKg = "13.5";
  const result = buildBodyComposition(swapped, [], { minRestDays: 3 });
  assert.deepEqual(result.errors, []);
  assert.ok(result.record);
  assert.deepEqual(result.checks, [
    "脂肪量 56.9kg が、体重×体脂肪率（13.52kg）と 1kg より大きく違います",
  ]);
  // 足して体重にならない
  const off = filledForm();
  off.leanMassKg = "55.8";
  assert.deepEqual(buildBodyComposition(off, [], { minRestDays: 3 }).checks, [
    "脂肪量と除脂肪量の合計 69.3kg が、体重 70.4kg と 1kg より大きく違います",
  ]);
  // ちょうど 1kg の差は確かめを出さない
  const edge = filledForm();
  edge.leanMassKg = "55.9";
  assert.deepEqual(
    buildBodyComposition(edge, [], { minRestDays: 3 }).checks,
    [],
  );
  // 体重か体脂肪率が空なら比べない
  const noWeight = filledForm();
  noWeight.weightKg = "";
  noWeight.fatMassKg = "56.9";
  assert.deepEqual(
    buildBodyComposition(noWeight, [], { minRestDays: 3 }).checks,
    [],
  );
});

test("bodyComposition.daysSinceTrainingText: 測定日時が空・不正なら計算できない旨、トレが無ければ（記録なし）、あれば日数", () => {
  assert.equal(daysSinceTrainingText("", null), "測定日時を入れると計算します");
  assert.equal(
    daysSinceTrainingText("2026-10-05", null),
    "測定日時を入れると計算します",
  );
  assert.equal(daysSinceTrainingText("2026-10-05T07:30", null), "（記録なし）");
  assert.equal(daysSinceTrainingText("2026-10-05T07:30", 0), "0日");
  assert.equal(daysSinceTrainingText("2026-10-05T07:30", 4), "4日");
});

test("bodyComposition.isFormChanged: 開いたときの値から 1 か所でも変われば入力あり", () => {
  const initial = emptyBodyForm(null);
  assert.equal(isFormChanged(initial, emptyBodyForm(null)), false);
  assert.equal(isFormChanged(initial, { ...initial, note: "x" }), true);
  const segment = emptyBodyForm(null);
  segment.segments.trunk.fatKg = "7";
  assert.equal(isFormChanged(initial, segment), true);
});

/* 一覧の測定条件（今のトレの記録から計算し直す） ---------------------------- */

test("bodyComposition.withCurrentConditions: 最後のトレからの日数と印は、保存した値ではなく今のトレの記録から計算し直す（保存した行は変えない）", () => {
  // 保存したときは測定の 0 日前にトレがあった（悪い条件の印つき）
  const saved = body(1, "2026-10-05T07:30", {
    conditions: {
      previousDaySaltG: 2.5,
      lastTrainingAt: "2026-10-05T06:00",
      daysSinceLastTraining: 0,
      hoursSinceLastMeal: 3,
      note: "朝",
    },
    warnings: [gap],
  });
  // そのトレを取り消した後
  const [now] = withCurrentConditions([saved], [], 3);
  assert.equal(now.conditions.daysSinceLastTraining, null);
  assert.equal(now.conditions.lastTrainingAt, null);
  assert.equal(now.conditions.note, "朝");
  assert.deepEqual(now.warnings, []);
  assert.equal(isPoorCondition(now), false);
  // 保存した行はそのまま
  assert.equal(saved.conditions.daysSinceLastTraining, 0);
  assert.deepEqual(saved.warnings, [gap]);

  // 今は 2 日前にトレがある（3 日未満の印）。測定より後のトレは数えない
  const [again] = withCurrentConditions(
    [body(2, "2026-10-05T07:30")],
    [
      sessionFixture({ id: 1, startedAt: "2026-10-03T19:00" }),
      sessionFixture({ id: 2, startedAt: "2026-10-05T18:00" }),
    ],
    3,
  );
  assert.equal(again.conditions.daysSinceLastTraining, 2);
  assert.deepEqual(
    again.warnings.map((w) => w.code),
    ["training_gap_lt3"],
  );
  // 空ける日数の設定に従う
  const [relaxed] = withCurrentConditions(
    [body(2, "2026-10-05T07:30")],
    [sessionFixture({ startedAt: "2026-10-03T19:00" })],
    2,
  );
  assert.deepEqual(relaxed.warnings, []);
});

test("bodyComposition.trainingStartNote: 数えたトレの開始時刻が仮置きなら「（開始時刻は仮置き）」を添える", () => {
  assert.equal(ESTIMATED_START_NOTE, "（開始時刻は仮置き）");
  const estimated = sessionFixture({
    startedAt: "2026-10-03T07:30",
    startedAtIsEstimated: true,
  });
  assert.equal(
    trainingStartNote([estimated], "2026-10-05T07:30"),
    ESTIMATED_START_NOTE,
  );
  // 後から実測のトレがあれば、そちらを数えるので添えない
  assert.equal(
    trainingStartNote(
      [estimated, sessionFixture({ id: 2, startedAt: "2026-10-04T19:00" })],
      "2026-10-05T07:30",
    ),
    "",
  );
  // 測定より後の仮置きは数えない / 測定日時が空なら添えない
  assert.equal(trainingStartNote([estimated], "2026-10-03T07:00"), "");
  assert.equal(trainingStartNote([estimated], ""), "");
});
