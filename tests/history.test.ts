/**
 * 種目の推移グラフに描く値（lib/history.ts）。
 *
 *  - 重量種目は「進捗を追う重量」（ダンベルは片手、それ以外は総重量）
 *  - 時間種目は各回の最長秒数、限界までの種目は各回の最多回数
 * 記録が無い回は描かない。値は架空のサンプル。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { LoadSpec } from "../src/db/types.ts";
import { chartData, chartValueOf, metricOf } from "../src/lib/history.ts";
import type { HistoryPoint } from "../src/lib/training.ts";
import { setRecordFixture } from "./helpers.ts";

const bar: LoadSpec = {
  style: "barbell",
  barType: "short",
  plateKgPerSide: 12.5,
};
const dumbbell: LoadSpec = { style: "dumbbell", kgPerHand: 14, hands: 2 };
const bodyweight: LoadSpec = { style: "bodyweight", addedKg: null };

function point(
  logDate: string,
  load: LoadSpec,
  sets: { reps?: number | null; seconds?: number | null }[] = [],
  outcome: HistoryPoint["outcome"] = "achieved",
): HistoryPoint {
  return {
    logDate,
    startedAt: `${logDate}T18:00`,
    load,
    outcome,
    sets: sets.map((set, i) =>
      setRecordFixture({
        setNo: i + 1,
        reps: set.reps ?? null,
        seconds: set.seconds ?? null,
      }),
    ),
  };
}

test("history.metricOf: 単位と題（重量は kg・時間種目は秒・限界までの種目は回）", () => {
  assert.deepEqual(metricOf("weight_reps"), {
    unit: "kg",
    title: "重量の推移",
  });
  assert.deepEqual(metricOf("timed"), {
    unit: "秒",
    title: "秒数の推移（各回の最長）",
  });
  assert.deepEqual(metricOf("amrap"), {
    unit: "回",
    title: "回数の推移（各回の最多）",
  });
});

test("history.chartValueOf: 重量種目は進捗を追う重量（ダンベルは片手、それ以外は総重量）", () => {
  assert.equal(chartValueOf(point("2026-10-01", bar), "weight_reps"), 35);
  assert.equal(chartValueOf(point("2026-10-01", dumbbell), "weight_reps"), 14);
  assert.equal(
    chartValueOf(point("2026-10-01", bodyweight), "weight_reps"),
    null,
  );
});

test("history.chartValueOf: 時間種目は最長の秒数、限界までの種目は最多の回数。入力のあるセットが無ければ null", () => {
  const timed = point("2026-10-01", dumbbell, [
    { seconds: 40 },
    { seconds: 45 },
    { seconds: 38 },
  ]);
  assert.equal(chartValueOf(timed, "timed"), 45);
  const amrap = point("2026-10-01", bodyweight, [
    { reps: 22 },
    { reps: 25 },
    { reps: 18 },
  ]);
  assert.equal(chartValueOf(amrap, "amrap"), 25);
  assert.equal(
    chartValueOf(point("2026-10-01", dumbbell, [{ reps: 10 }]), "timed"),
    null,
  );
  assert.equal(
    chartValueOf(point("2026-10-01", bodyweight, []), "amrap"),
    null,
  );
});

test("history.chartData: 点の並びは履歴のまま。値の無い回は飛ばし、日付は 9/30（水）の形、内訳は短い表示", () => {
  const points = [
    point("2026-09-30", bar, [], "achieved"),
    point("2026-10-02", bodyweight, [], "unknown"),
    point("2026-10-07", dumbbell, [], "held"),
  ];
  assert.deepEqual(chartData(points, "weight_reps"), [
    { label: "9/30（水）", value: 35, outcome: "achieved", detail: "35kg" },
    { label: "10/7（水）", value: 14, outcome: "held", detail: "14kg×2" },
  ]);
  assert.deepEqual(chartData([], "weight_reps"), []);
});
