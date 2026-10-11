/**
 * 数値の丸め・整形の境目（H-05）。いまの出力を、関数ごとに並べて固定する特性テスト。
 *
 * 丸めの規則は、Math.round 系（nutrition.fmtNum / meals.formatQuantity / progression.nextWeight /
 * weight の kg 表示 / 栄養値の掛け算・足し算）、toFixed 系（goals.formatAmount の P・脂質・塩分）、
 * Intl 系（formatKcal.fmtKcal / fmtKcalItem / fmtStored、goals.formatAmount の kcal）が混在していて、
 * 同じ量でも画面や関数によって端数が変わる。ここでは「どの入力でどの関数が何を返すか」をそのまま写す。
 * 規則をそろえるときは、この表が変わる（＝見た目と Markdown が変わる）ことを承知のうえで直す。
 *
 * 見どころ:
 *  - 2.675 … 2 進数では 2.67499… なので toFixed(2) は '2.67'、Math.round(2.675 * 100) は 268 → '2.68'
 *  - -0.4 … kcal の整数化で Math.round が -0 を返し、goals.formatAmount は '-0'、fmtKcal は '0'
 *  - 84.85 … P は toFixed(1) で '84.8'、行の kcal（fmtKcalItem）は '84.9'、fmtNum は '84.85'
 * 値は架空のサンプル。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtKcal, fmtKcalItem } from "../src/lib/formatKcal.ts";
import { fmtStored } from "../src/lib/format.ts";
import { formatAmount } from "../src/lib/goals.ts";
import { formatQuantity } from "../src/lib/meals.ts";
import { fmtNum, scaleNutrition, sumNutrition } from "../src/lib/nutrition.ts";
import { nextWeight } from "../src/lib/progression.ts";
import { describeLoad } from "../src/lib/weight.ts";
import { nutrition } from "./helpers.ts";

/** -0 は String(-0) が '0' になって見分けられないので、'-0' と書く */
function text(value: number | null): string {
  return Object.is(value, -0) ? "-0" : String(value);
}

/** 1 つの数値を各関数に通した結果 */
function outputsFor(x: number) {
  return {
    fmtNum: fmtNum(x),
    amountKcal: formatAmount("kcal", x),
    amountProtein: formatAmount("proteinG", x),
    amountSalt: formatAmount("saltG", x),
    fmtKcal: fmtKcal(x),
    fmtKcalItem: fmtKcalItem(x),
    fmtStored: fmtStored(x),
    formatQuantity: formatQuantity(x),
    scaled: text(scaleNutrition(nutrition({ kcal: x }), 1).kcal),
    summed: text(sumNutrition([nutrition({ kcal: x })]).value.kcal),
    nextWeight: text(nextWeight(x, 0)),
    machine: describeLoad({ style: "machine", stackKg: x }),
  };
}

const BOUNDARIES: [string, number, ReturnType<typeof outputsFor>][] = [
  [
    "2.675",
    2.675,
    {
      fmtNum: "2.68",
      amountKcal: "3",
      amountProtein: "2.7",
      amountSalt: "2.67",
      fmtKcal: "3",
      fmtKcalItem: "2.7",
      fmtStored: "2.675",
      formatQuantity: "2.68",
      scaled: "2.68",
      summed: "2.68",
      nextWeight: "2.68",
      machine: "2.68kg（マシン）",
    },
  ],
  [
    "-0.4",
    -0.4,
    {
      fmtNum: "-0.4",
      amountKcal: "-0",
      amountProtein: "-0.4",
      amountSalt: "-0.4",
      fmtKcal: "0",
      fmtKcalItem: "-0.4",
      fmtStored: "-0.4",
      formatQuantity: "-0.4",
      scaled: "-0.4",
      summed: "-0.4",
      nextWeight: "-0.4",
      machine: "-0.4kg（マシン）",
    },
  ],
  [
    "84.85",
    84.85,
    {
      fmtNum: "84.85",
      amountKcal: "85",
      amountProtein: "84.8",
      amountSalt: "84.85",
      fmtKcal: "85",
      fmtKcalItem: "84.9",
      fmtStored: "84.85",
      formatQuantity: "84.85",
      scaled: "84.85",
      summed: "84.85",
      nextWeight: "84.85",
      machine: "84.85kg（マシン）",
    },
  ],
  [
    "0.005",
    0.005,
    {
      fmtNum: "0.01",
      amountKcal: "0",
      amountProtein: "0",
      amountSalt: "0.01",
      fmtKcal: "0",
      fmtKcalItem: "0",
      fmtStored: "0.005",
      formatQuantity: "0.01",
      scaled: "0.01",
      summed: "0.01",
      nextWeight: "0.01",
      machine: "0.01kg（マシン）",
    },
  ],
  [
    "1.005",
    1.005,
    {
      fmtNum: "1",
      amountKcal: "1",
      amountProtein: "1",
      amountSalt: "1",
      fmtKcal: "1",
      fmtKcalItem: "1",
      fmtStored: "1.005",
      formatQuantity: "1",
      scaled: "1",
      summed: "1",
      nextWeight: "1",
      machine: "1kg（マシン）",
    },
  ],
  [
    "1234.5",
    1234.5,
    {
      fmtNum: "1234.5",
      amountKcal: "1,235",
      amountProtein: "1234.5",
      amountSalt: "1234.5",
      fmtKcal: "1,235",
      fmtKcalItem: "1,234.5",
      fmtStored: "1,234.5",
      formatQuantity: "1234.5",
      scaled: "1234.5",
      summed: "1234.5",
      nextWeight: "1234.5",
      machine: "1234.5kg（マシン）",
    },
  ],
  [
    "-0.04",
    -0.04,
    {
      fmtNum: "-0.04",
      amountKcal: "-0",
      amountProtein: "-0",
      amountSalt: "-0.04",
      fmtKcal: "0",
      fmtKcalItem: "0",
      fmtStored: "-0.04",
      formatQuantity: "-0.04",
      scaled: "-0.04",
      summed: "-0.04",
      nextWeight: "-0.04",
      machine: "-0.04kg（マシン）",
    },
  ],
  [
    "0.045",
    0.045,
    {
      fmtNum: "0.05",
      amountKcal: "0",
      amountProtein: "0",
      amountSalt: "0.04",
      fmtKcal: "0",
      fmtKcalItem: "0",
      fmtStored: "0.045",
      formatQuantity: "0.05",
      scaled: "0.05",
      summed: "0.05",
      nextWeight: "0.05",
      machine: "0.05kg（マシン）",
    },
  ],
  [
    "118.55",
    118.55,
    {
      fmtNum: "118.55",
      amountKcal: "119",
      amountProtein: "118.5",
      amountSalt: "118.55",
      fmtKcal: "119",
      fmtKcalItem: "118.6",
      fmtStored: "118.55",
      formatQuantity: "118.55",
      scaled: "118.55",
      summed: "118.55",
      nextWeight: "118.55",
      machine: "118.55kg（マシン）",
    },
  ],
  [
    "0.1 + 0.2",
    0.1 + 0.2,
    {
      fmtNum: "0.3",
      amountKcal: "0",
      amountProtein: "0.3",
      amountSalt: "0.3",
      fmtKcal: "0",
      fmtKcalItem: "0.3",
      fmtStored: "0.30000000000000004",
      formatQuantity: "0.3",
      scaled: "0.3",
      summed: "0.3",
      nextWeight: "0.3",
      machine: "0.3kg（マシン）",
    },
  ],
  [
    "8.345",
    8.345,
    {
      fmtNum: "8.35",
      amountKcal: "8",
      amountProtein: "8.3",
      amountSalt: "8.35",
      fmtKcal: "8",
      fmtKcalItem: "8.3",
      fmtStored: "8.345",
      formatQuantity: "8.35",
      scaled: "8.35",
      summed: "8.35",
      nextWeight: "8.35",
      machine: "8.35kg（マシン）",
    },
  ],
  [
    "0",
    0,
    {
      fmtNum: "0",
      amountKcal: "0",
      amountProtein: "0",
      amountSalt: "0",
      fmtKcal: "0",
      fmtKcalItem: "0",
      fmtStored: "0",
      formatQuantity: "0",
      scaled: "0",
      summed: "0",
      nextWeight: "0",
      machine: "0kg（マシン）",
    },
  ],
  [
    "-0",
    -0,
    {
      fmtNum: "0",
      amountKcal: "-0",
      amountProtein: "0",
      amountSalt: "0",
      fmtKcal: "0",
      fmtKcalItem: "0",
      fmtStored: "0",
      formatQuantity: "0",
      scaled: "-0",
      summed: "0",
      nextWeight: "0",
      machine: "0kg（マシン）",
    },
  ],
];

for (const [label, input, expected] of BOUNDARIES) {
  test(`rounding: ${label} を各関数に通した結果（H-05 の境目）`, () => {
    assert.deepEqual(outputsFor(input), expected);
  });
}

test("rounding: 欠けた値（null・NaN）は '—'。fmtNum の接尾辞も付かない", () => {
  assert.equal(fmtNum(null), "—");
  assert.equal(fmtNum(null, "g"), "—");
  assert.equal(fmtNum(Number.NaN), "—");
  assert.equal(fmtKcal(null), "—");
  assert.equal(fmtKcalItem(Number.NaN), "—");
  assert.equal(fmtStored(null), "—");
});

test("rounding: 栄養値の掛け算は 1 回、足し算は「1 件足すごと」に小数第 2 位で丸める", () => {
  // 1 件ずつ丸めるので、0.004 を 3 回足しても 0 のまま（まとめて足して丸めると 0.01）
  const tiny = nutrition({ kcal: 0.004, proteinG: 0.004 });
  const sum = sumNutrition([tiny, tiny, tiny]);
  assert.equal(sum.value.kcal, 0);
  assert.equal(sum.value.proteinG, 0);
  assert.equal(Math.round((0.004 + 0.004 + 0.004) * 100) / 100, 0.01);
  // 掛け算: 3 個で 2.675 × 3 = 8.025 → 8.03 ではなく 8.02（2 進数の誤差を含んだまま丸める）
  assert.equal(scaleNutrition(nutrition({ kcal: 2.675 }), 3).kcal, 8.02);
  assert.equal(scaleNutrition(nutrition({ kcal: 118.6 }), 0.5).kcal, 59.3);
});

test("rounding: 次回の重量は 現在 + 増分 を小数第 2 位で丸める（0.1 + 0.2 は 0.3）", () => {
  assert.equal(nextWeight(0.1, 0.2), 0.3);
  assert.equal(nextWeight(80, 3.5), 83.5);
  assert.equal(nextWeight(2.675, 0), 2.68);
});
