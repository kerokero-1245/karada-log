/**
 * 推移グラフの SVG（components/TrendChart.tsx と、体組成のグラフ screens/body/BodyTrendChart.tsx）。
 * renderToStaticMarkup で描いた文字列を見る特性テスト（ブラウザも追加の依存も使わない。
 * .tsx の読み込みは tests/setup.mjs が TypeScript で変換する）。
 *
 *  - 目標ライン（reference）は破線で描く。渡さなければ描かない
 *  - 条件が悪い測定（filled: false）の点は白抜き、それ以外は塗りつぶし
 *  - 縦軸の数字は最初の点に重ならない（点の左端より左で終わる）
 *  - 縦軸の最大・最小の数字は、間隔が文字の高さより狭ければ片方だけ出す（重ねない）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrendChart } from "../src/components/TrendChart.tsx";
import { BodyTrendChart } from "../src/screens/body/BodyTrendChart.tsx";
import { bodyTrend } from "../src/lib/bodyComposition.ts";
import type { TrendPoint } from "../src/lib/trendChart.ts";
import { bodyFixture, settingsFixture } from "./helpers.ts";

const LINE = "#059669";
const HOLLOW = "#ffffff";
const AXIS_FONT = 10;

function points(values: number[], filled: boolean[] = []): TrendPoint[] {
  return values.map((value, i) => ({
    label: `10/${i + 1}（木）`,
    value,
    filled: filled[i] ?? true,
    detail: "",
    status: "",
  }));
}

/** 点の円（r=4.5）の [cx, cy, fill] */
function dots(svg: string): [number, number, string][] {
  return [
    ...svg.matchAll(
      /<circle cx="([\d.]+)" cy="([\d.]+)" r="4.5" fill="([^"]+)"/g,
    ),
  ].map((m) => [Number(m[1]), Number(m[2]), m[3]]);
}

/** 縦軸の数字の [x, y, 文字] */
function axisLabels(svg: string): [number, number, string][] {
  return [
    ...svg.matchAll(
      /<text x="([\d.]+)" y="([\d.]+)" text-anchor="end" font-size="10" fill="#64748b">([^<]+)<\/text>/g,
    ),
  ]
    .filter((m) => !m[3].includes("（"))
    .map((m) => [Number(m[1]), Number(m[2]), m[3]]);
}

function render(props: Parameters<typeof TrendChart>[0]): string {
  return renderToStaticMarkup(createElement(TrendChart, props));
}

test("TrendChart: 目標ライン（reference）を渡すと破線を描き、渡さなければ描かない", () => {
  const withRef = render({
    title: "t",
    legend: "l",
    unit: "kg",
    points: points([14, 13.6]),
    reference: { value: 11, label: "目標 11kg" },
    testId: "c",
  });
  assert.match(withRef, /data-testid="c-reference"/);
  assert.match(withRef, /stroke-dasharray="4 3"/);
  const without = render({
    title: "t",
    legend: "l",
    unit: "kg",
    points: points([14, 13.6]),
    testId: "c",
  });
  assert.doesNotMatch(without, /stroke-dasharray/);
});

test("TrendChart: filled が false の点は白抜き、true の点は塗りつぶし", () => {
  const svg = render({
    title: "t",
    legend: "l",
    unit: "kg",
    points: points([14, 13.6, 13.1], [false, true, false]),
    testId: "c",
  });
  assert.deepEqual(
    dots(svg).map((d) => d[2]),
    [HOLLOW, LINE, HOLLOW],
  );
});

test("TrendChart: 縦軸の数字は最初の点の左端より左で終わる（点に重ならない）", () => {
  const svg = render({
    title: "t",
    legend: "l",
    unit: "kg",
    points: points([14, 13.6, 13.1]),
    reference: { value: 11, label: "目標 11kg" },
    testId: "c",
    padRight: 56,
  });
  const [first] = dots(svg);
  const labels = axisLabels(svg);
  assert.ok(labels.length > 0);
  // 右揃えの文字の右端（x）が、点の左端（中心 - 半径 4.5 - 線の太さの半分 1）より左
  for (const [x] of labels) assert.ok(x < first[0] - 5.5, `x=${x}`);
});

test("TrendChart: 縦軸の最大・最小の数字の間隔が文字の高さより狭ければ、片方だけ出す", () => {
  // 除脂肪 56.3 → 56.2、目標 58.6（目標が遠いと 2 つの数字が数 px まで寄る）
  const close = render({
    title: "t",
    legend: "l",
    unit: "kg",
    points: points([56.3, 56.2]),
    reference: { value: 58.6, label: "目標 58.6kg" },
    testId: "c",
    padRight: 56,
    minSpan: 2,
  });
  const closeLabels = axisLabels(close);
  assert.equal(closeLabels.length, 1, JSON.stringify(closeLabels));
  // 間隔が十分なら 2 つとも出す
  const apart = render({
    title: "t",
    legend: "l",
    unit: "kg",
    points: points([14, 13.1]),
    reference: { value: 11, label: "目標 11kg" },
    testId: "c",
  });
  const apartLabels = axisLabels(apart);
  assert.equal(apartLabels.length, 2, JSON.stringify(apartLabels));
  assert.ok(Math.abs(apartLabels[0][1] - apartLabels[1][1]) >= AXIS_FONT);
});

test("BodyTrendChart: 体組成のグラフは目標の破線を描き、条件が悪い測定の点を白抜きにする", () => {
  const goal = settingsFixture().goal;
  const poor = {
    code: "training_gap_lt3" as const,
    severity: "high" as const,
    message: "最後のトレーニングから1日です",
  };
  const rows = [
    bodyFixture({ id: 1, measuredAt: "2026-09-15T10:10", warnings: [poor] }),
    bodyFixture({ id: 2, measuredAt: "2026-09-29T08:00" }),
  ];
  const svg = renderToStaticMarkup(
    createElement(BodyTrendChart, {
      trend: bodyTrend(rows, "fatMassKg", goal),
      testId: "body-chart-fatMassKg",
    }),
  );
  assert.match(svg, /data-testid="body-chart-fatMassKg-reference"/);
  assert.match(svg, /stroke-dasharray="4 3"/);
  assert.match(svg, /破線: 目標（年末）12kg/);
  // 凡例は「条件よし」と言い切らない（印が無いだけ）
  assert.match(svg, /● 印なし ○ 条件が悪い/);
  assert.deepEqual(
    dots(svg).map((d) => d[2]),
    [HOLLOW, LINE],
  );
});

test("TrendChart / BodyTrendChart: 最小幅を渡すと 0.1kg の差は小さく描く（渡さなければ描画域いっぱい）", () => {
  // 除脂肪 56 → 56 → 55.9、目標 56
  const spread = (svg: string) => {
    const ys = dots(svg).map((d) => d[1]);
    return Math.max(...ys) - Math.min(...ys);
  };
  const base = {
    title: "t",
    legend: "l",
    unit: "kg",
    points: points([56, 56, 55.9]),
    reference: { value: 56, label: "目標 56kg" },
    testId: "c",
  };
  assert.ok(spread(render(base)) > 50, String(spread(render(base))));
  assert.ok(
    spread(render({ ...base, minSpan: 2 })) < 10,
    String(spread(render({ ...base, minSpan: 2 }))),
  );
  const goal = { ...settingsFixture().goal, leanMassKg: 56 };
  const rows = [56, 56, 55.9].map((leanMassKg, i) =>
    bodyFixture({ id: i + 1, measuredAt: `2026-09-1${i}T08:00`, leanMassKg }),
  );
  const body = renderToStaticMarkup(
    createElement(BodyTrendChart, {
      trend: bodyTrend(rows, "leanMassKg", goal),
      testId: "body-chart-leanMassKg",
    }),
  );
  assert.ok(spread(body) < 10, String(spread(body)));
});
