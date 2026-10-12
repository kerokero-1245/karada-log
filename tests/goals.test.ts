/**
 * 目標値と進捗バーのモデル（lib/goals.ts）の今の出力を固定する特性テスト。
 *
 * 文言のルール: 足りない分は残量（あと○）で示す。カロリー・P・脂質は下限型（届けば緑）、
 * P の上限を超えた分はグレー、塩分だけ上限型（超えたら赤）。値は架空のサンプル。
 * BarModel のうち画面が読む項目（key・label・unknownCount・valueText・remainText・legendText・noteText・
 * tone・segments・markers）を比べる。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBars,
  dayTargetKcal,
  formatAmount,
  toneTextClass,
} from "../src/lib/goals.ts";
import type { BarModel } from "../src/lib/goals.ts";
import type { NutritionTotal } from "../src/lib/nutrition.ts";
import type { NutrientKey } from "../src/db/types.ts";
import { settingsFixture } from "./helpers.ts";

const settings = settingsFixture();

function totalFixture(
  value: Partial<Record<NutrientKey, number>>,
  unknown: Partial<Record<NutrientKey, number>> = {},
): NutritionTotal {
  return {
    value: { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, saltG: 0, ...value },
    unknown: { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, saltG: 0, ...unknown },
  };
}

/** 画面が読む項目だけを取り出す */
function shown(bar: BarModel) {
  return {
    key: bar.key,
    label: bar.label,
    unknownCount: bar.unknownCount,
    valueText: bar.valueText,
    remainText: bar.remainText,
    legendText: bar.legendText,
    noteText: bar.noteText,
    tone: bar.tone,
    segments: bar.segments,
    markers: bar.markers,
  };
}

test("goals.dayTargetKcal / toneTextClass: 日の区分で目標が変わり、色は tone から決まる", () => {
  assert.equal(dayTargetKcal(settings, "gym"), 2200);
  assert.equal(dayTargetKcal(settings, "rest"), 2000);
  assert.deepEqual(
    (["amber", "emerald", "sky", "red"] as const).map(toneTextClass),
    ["text-amber-700", "text-emerald-700", "text-sky-700", "text-red-700"],
  );
});

test("goals.formatAmount: kcal は整数＋桁区切り、それ以外は Math.round 系（round2）の値をそのまま（末尾の 0 は付かない）", () => {
  assert.equal(formatAmount("kcal", 2000), "2,000");
  assert.equal(formatAmount("kcal", 1234.5), "1,235");
  assert.equal(formatAmount("proteinG", 140), "140");
  assert.equal(formatAmount("proteinG", 84.84), "84.84");
  assert.equal(formatAmount("fatG", 12.95), "12.95");
  assert.equal(formatAmount("saltG", 2.16), "2.16");
  assert.equal(formatAmount("saltG", 5.8), "5.8");
});

test("goals.buildBars: 4 本（カロリー・たんぱく質・脂質・塩分）。届いていなければ黄色、塩分は水色", () => {
  const bars = buildBars(
    totalFixture(
      { kcal: 501, proteinG: 84.8, fatG: 12.9, saltG: 2.16 },
      { saltG: 1 },
    ),
    settings,
    "rest",
  );
  assert.deepEqual(bars.map(shown), [
    {
      key: "kcal",
      label: "カロリー",
      unknownCount: 0,
      valueText: "501 / 2,000 kcal",
      remainText: "あと 1,499kcal",
      legendText: "目標 2,000kcal",
      noteText: null,
      tone: "amber",
      segments: [{ widthPercent: 25.05, className: "bg-amber-400" }],
      markers: [{ percent: 100, label: "目標 2,000kcal" }],
    },
    {
      key: "proteinG",
      label: "たんぱく質",
      unknownCount: 0,
      valueText: "84.8 / 130 g",
      remainText: "あと 45.2g",
      legendText: "目標 130g　上限 150g",
      noteText: null,
      tone: "amber",
      segments: [
        { widthPercent: 56.53333333333334, className: "bg-amber-400" },
      ],
      markers: [
        { percent: 86.66666666666667, label: "目標 130g" },
        { percent: 100, label: "上限 150g" },
      ],
    },
    {
      key: "fatG",
      label: "脂質",
      unknownCount: 0,
      valueText: "12.9 / 50 g",
      remainText: "あと 37.1g",
      legendText: "目標 50g",
      noteText: null,
      tone: "amber",
      segments: [{ widthPercent: 25.8, className: "bg-amber-400" }],
      markers: [{ percent: 100, label: "目標 50g" }],
    },
    {
      key: "saltG",
      label: "塩分",
      unknownCount: 1,
      valueText: "2.16 / 7 g",
      remainText: "上限まで あと 4.84g",
      legendText: "上限 7g",
      noteText: null,
      tone: "sky",
      segments: [{ widthPercent: 30.85714285714286, className: "bg-sky-500" }],
      markers: [{ percent: 100, label: "上限 7g" }],
    },
  ]);
});

test("goals.buildBars: 目標を超えたら「目標に到達（+○）」。P の上限より上はグレーで「これ以上は使われません」、塩分超過は赤", () => {
  const bars = buildBars(
    totalFixture(
      { kcal: 2300, proteinG: 160, fatG: 70, saltG: 8.25 },
      { kcal: 2, proteinG: 1 },
    ),
    settings,
    "rest",
  );
  assert.deepEqual(bars.map(shown), [
    {
      key: "kcal",
      label: "カロリー",
      unknownCount: 2,
      valueText: "2,300 / 2,000 kcal",
      remainText: "目標に到達（+300kcal）",
      legendText: "目標 2,000kcal",
      noteText: null,
      tone: "emerald",
      segments: [
        { widthPercent: 86.95652173913044, className: "bg-emerald-500" },
        { widthPercent: 13.043478260869565, className: "bg-emerald-300" },
      ],
      markers: [{ percent: 86.95652173913044, label: "目標 2,000kcal" }],
    },
    {
      key: "proteinG",
      label: "たんぱく質",
      unknownCount: 1,
      valueText: "160 / 130 g",
      remainText: "目標に到達（+30g）",
      legendText: "目標 130g　上限 150g",
      noteText: "150g より上の 10g は、これ以上は使われません",
      tone: "emerald",
      segments: [
        { widthPercent: 81.25, className: "bg-emerald-500" },
        { widthPercent: 12.5, className: "bg-emerald-300" },
        { widthPercent: 6.25, className: "bg-slate-400" },
      ],
      markers: [
        { percent: 81.25, label: "目標 130g" },
        { percent: 93.75, label: "上限 150g" },
      ],
    },
    {
      key: "fatG",
      label: "脂質",
      unknownCount: 0,
      valueText: "70 / 50 g",
      remainText: "目標に到達（+20g）",
      legendText: "目標 50g",
      noteText: null,
      tone: "emerald",
      segments: [
        { widthPercent: 71.42857142857143, className: "bg-emerald-500" },
        { widthPercent: 28.57142857142857, className: "bg-emerald-300" },
      ],
      markers: [{ percent: 71.42857142857143, label: "目標 50g" }],
    },
    {
      key: "saltG",
      label: "塩分",
      unknownCount: 0,
      valueText: "8.25 / 7 g",
      remainText: "上限まで -1.25g",
      legendText: "上限 7g",
      noteText: null,
      tone: "red",
      segments: [
        { widthPercent: 84.84848484848484, className: "bg-sky-500" },
        { widthPercent: 15.151515151515152, className: "bg-red-500" },
      ],
      markers: [{ percent: 84.84848484848484, label: "上限 7g" }],
    },
  ]);
});

test("goals.buildBars: 目標ちょうどは「到達（+0）」で緑、塩分は上限ちょうどなら水色のまま。何も無い日は空のバー", () => {
  const exact = buildBars(
    totalFixture({ kcal: 2000, proteinG: 130, fatG: 50, saltG: 7 }),
    settings,
    "rest",
  ).map(shown);
  assert.deepEqual(
    exact.map((bar) => [bar.remainText, bar.tone, bar.segments.length]),
    [
      ["目標に到達（+0kcal）", "emerald", 1],
      ["目標に到達（+0g）", "emerald", 1],
      ["目標に到達（+0g）", "emerald", 1],
      ["上限まで あと 0g", "sky", 1],
    ],
  );

  const empty = buildBars(totalFixture({}), settings, "rest").map(shown);
  assert.deepEqual(
    empty.map((bar) => [bar.valueText, bar.remainText, bar.tone, bar.segments]),
    [
      ["0 / 2,000 kcal", "あと 2,000kcal", "amber", []],
      ["0 / 130 g", "あと 130g", "amber", []],
      ["0 / 50 g", "あと 50g", "amber", []],
      ["0 / 7 g", "上限まで あと 7g", "sky", []],
    ],
  );
});

test("goals.buildBars: ジムの日はカロリー目標が gymDayKcal になる", () => {
  const [kcal] = buildBars(totalFixture({ kcal: 501 }), settings, "gym");
  assert.equal(kcal.valueText, "501 / 2,200 kcal");
  assert.equal(kcal.remainText, "あと 1,699kcal");
  assert.equal(kcal.legendText, "目標 2,200kcal");
});
