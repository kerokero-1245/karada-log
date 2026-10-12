/**
 * 行の表示値の和と、合計の表示値が一致すること（H-05 の裁定）。
 *
 * たんぱく質・脂質・炭水化物・塩分は、行（1 品）も合計も進捗バーも書き出しも、小数第 2 位で丸めた値をそのまま出す。
 * 合計（sumNutrition）は 1 件足すごとに小数第 2 位で丸めるので、行に出た値を足すと合計の表示になる。
 * 以前は進捗バー・書き出しが toFixed（たんぱく質・脂質は小数第 1 位）で、同じ合計がシートと進捗バーで違う桁になった。
 * kcal は今の規則（行は小数第 1 位の fmtKcalItem、合計は整数の fmtKcal）のまま。行の和と合計が整数でそろう値で確かめる。
 * 値は架空のサンプル。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NUTRIENT_NAMES } from "../src/db/types.ts";
import type { MealEntry, NutrientKey } from "../src/db/types.ts";
import { buildMarkdown } from "../src/lib/exportMarkdown.ts";
import type { ExportInput } from "../src/lib/exportMarkdown.ts";
import { fmtKcal, fmtKcalItem } from "../src/lib/formatKcal.ts";
import { buildBars, formatAmount } from "../src/lib/goals.ts";
import { entryNutrition } from "../src/lib/mealView.ts";
import { fmtNum, sumNutrition } from "../src/lib/nutrition.ts";
import {
  foodFixture,
  mealEntryFixture,
  nutrition,
  settingsFixture,
  snapshotFixture,
} from "./helpers.ts";

/** 表示された文字列を 100 倍した整数にする（小数の足し算の誤差を避けて、桁どうしを足し合わせる） */
function cents(text: string): number {
  return Math.round(Number(text) * 100);
}

/** 端数のある値を並べた 3〜5 行の例（数量は 1 以外も混ぜる） */
const EXAMPLES: {
  name: string;
  rows: { per: Partial<Record<NutrientKey, number>>; quantity: number }[];
}[] = [
  {
    name: "たんぱく質・脂質・塩分とも 2 桁の端数が出る 4 行",
    rows: [
      {
        per: {
          kcal: 138,
          proteinG: 2.675,
          fatG: 0.15,
          carbG: 4.345,
          saltG: 0.055,
        },
        quantity: 1,
      },
      {
        per: { kcal: 95, proteinG: 11.8, fatG: 0.15, carbG: 8.1, saltG: 0.055 },
        quantity: 1.5,
      },
      {
        per: {
          kcal: 118.5,
          proteinG: 21.7,
          fatG: 1.8,
          carbG: 4.7,
          saltG: 0.11,
        },
        quantity: 0.5,
      },
      {
        per: { kcal: 72, proteinG: 18, fatG: 0.6, carbG: 0.8, saltG: 0.64 },
        quantity: 3,
      },
    ],
  },
  {
    name: "0.055 を 3 回（行ごとに 0.06 に丸まる。まとめて足して丸めた 0.17 ではなく 0.18）",
    rows: [
      {
        per: {
          kcal: 10,
          proteinG: 0.055,
          fatG: 0.055,
          carbG: 0.055,
          saltG: 0.055,
        },
        quantity: 1,
      },
      {
        per: {
          kcal: 10,
          proteinG: 0.055,
          fatG: 0.055,
          carbG: 0.055,
          saltG: 0.055,
        },
        quantity: 1,
      },
      {
        per: {
          kcal: 10,
          proteinG: 0.055,
          fatG: 0.055,
          carbG: 0.055,
          saltG: 0.055,
        },
        quantity: 1,
      },
    ],
  },
  {
    name: "大きい値と小さい値が混ざる 5 行",
    rows: [
      {
        per: { kcal: 700, proteinG: 57, fatG: 50, carbG: 0, saltG: 2 },
        quantity: 1,
      },
      {
        per: { kcal: 1300, proteinG: 40, fatG: 38, carbG: 0, saltG: 6.5 },
        quantity: 1,
      },
      {
        per: { kcal: 76, proteinG: 0.8, fatG: 7.6, carbG: 0, saltG: 0 },
        quantity: 3,
      },
      {
        per: { kcal: 252, proteinG: 3.8, fatG: 0.5, carbG: 55.7, saltG: 0 },
        quantity: 1.25,
      },
      {
        per: { kcal: 65, proteinG: 5.8, fatG: 4.3, carbG: 0.3, saltG: 0.6 },
        quantity: 2,
      },
    ],
  },
];

const GRAM_KEYS = ["proteinG", "fatG", "carbG", "saltG"] as const;

for (const example of EXAMPLES) {
  const entries: MealEntry[] = example.rows.map((row, i) =>
    mealEntryFixture({
      id: i + 1,
      quantity: row.quantity,
      recordedAt: `2026-09-21T${String(8 + i).padStart(2, "0")}:00`,
      snapshot: snapshotFixture(foodFixture({ per: nutrition(row.per) })),
    }),
  );
  const rowValues = entries.map(entryNutrition);
  const total = sumNutrition(rowValues);

  test(`行の表示値の和 = 合計の表示値（g の栄養素・シートの行と合計）: ${example.name}`, () => {
    for (const key of GRAM_KEYS) {
      const shownRows = rowValues.map((value) => fmtNum(value[key]));
      const shownTotal = fmtNum(total.value[key]);
      assert.equal(
        shownRows.reduce((sum, text) => sum + cents(text), 0),
        cents(shownTotal),
        `${key}: 行 ${shownRows.join(" + ")} の和が合計 ${shownTotal} と合わない`,
      );
    }
  });

  test(`行の表示値の和 = 合計の表示値（進捗バー・書き出しの桁もシートと同じ）: ${example.name}`, () => {
    // 進捗バー: 合計は formatAmount（= 行と同じ桁）。valueText の先頭がその合計
    const bars = buildBars(total, settingsFixture(), "rest");
    const barOf = (key: NutrientKey) => bars.find((bar) => bar.key === key);
    for (const key of ["proteinG", "fatG", "saltG"] as const) {
      assert.equal(
        formatAmount(key, total.value[key] ?? 0),
        fmtNum(total.value[key]),
      );
      assert.ok(
        barOf(key)?.valueText.startsWith(`${fmtNum(total.value[key])} / `),
      );
    }

    // 書き出し: 1 日分の表の行（P・脂質・塩分の列）の和 = その日の合計の行・期間サマリーの行
    const input: ExportInput = {
      range: { start: "2026-09-21", end: "2026-09-21" },
      generatedAt: "2026-09-21T21:00",
      settings: settingsFixture(),
      days: [{ logDate: "2026-09-21", dayType: "rest", entries, sessions: [] }],
      bodies: [],
      bodiesOutOfRange: false,
      pendingTexts: [],
    };
    const markdown = buildMarkdown(input);
    const lines = markdown.split("\n");
    const tableRows = lines
      .filter((line) => /^\| \d{2}:\d{2} \|/.test(line))
      .map((line) => line.slice(2, -2).split(" | "));
    assert.equal(tableRows.length, entries.length);
    const columns = { proteinG: 4, fatG: 5, saltG: 6 } as const;
    for (const key of ["proteinG", "fatG", "saltG"] as const) {
      const cellsSum = tableRows.reduce(
        (sum, cells) => sum + cents(cells[columns[key]]),
        0,
      );
      const totalText = fmtNum(total.value[key]);
      assert.equal(
        cellsSum,
        cents(totalText),
        `${key}: 表の行の和が合計 ${totalText} と合わない`,
      );
      const barLine = lines.find((line) =>
        line.startsWith(`- ${NUTRIENT_NAMES[key]} `),
      );
      assert.ok(
        barLine?.startsWith(`- ${NUTRIENT_NAMES[key]} ${totalText} / `),
        `${key}: ${barLine}`,
      );
    }
    // 期間サマリーの行（日付 | 曜日 | 区分 | kcal | P | 脂質 | 塩分 | …）
    const summary = lines
      .find((line) => line.startsWith("| 9/21 |"))
      ?.slice(2, -2)
      .split(" | ");
    assert.ok(summary);
    assert.equal(summary[4], fmtNum(total.value.proteinG));
    assert.equal(summary[5], fmtNum(total.value.fatG));
    assert.equal(summary[6], fmtNum(total.value.saltG));
  });
}

test("kcal は今の規則のまま: 行は小数第 1 位（fmtKcalItem）、合計は整数（fmtKcal）。行の和が整数になる値なら合計の表示と一致する", () => {
  const rows = [
    nutrition({ kcal: 700 }),
    nutrition({ kcal: 1300.5 }),
    nutrition({ kcal: 252.5 }),
  ];
  const total = sumNutrition(rows);
  assert.deepEqual(
    rows.map((value) => fmtKcalItem(value.kcal)),
    ["700", "1,300.5", "252.5"],
  );
  assert.equal(fmtKcal(total.value.kcal), "2,253");
  assert.equal(formatAmount("kcal", total.value.kcal ?? 0), "2,253");
});
