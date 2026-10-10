/**
 * 書き出し（Markdown）の見出し階層。
 *
 * 以前、「## 日ごとの詳細」の下に各日が同じ階層の「## 9/21（日）…」で並び、
 * その日のトレーニングが「###」だった。親と子が同じ「##」になり、目次や読み手（チャットの Claude）が
 * 各日を「日ごとの詳細」と並ぶ別の節と取り違える。
 * 「## 日ごとの詳細」>「###（日）」>「####（トレーニング）」の入れ子をここで固定する。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMarkdown } from "../src/lib/exportMarkdown.ts";
import type { ExportInput } from "../src/lib/exportMarkdown.ts";
import type { MealEntry, TrainingSession } from "../src/db/types.ts";
import { settingsFixture } from "./helpers.ts";

const settings = settingsFixture();

const entry: MealEntry = {
  id: 1,
  foodId: 1,
  quantity: 1,
  recordedAt: "2026-09-21T08:00",
  logDate: "2026-09-21",
  snapshot: {
    name: "サンプル食品",
    variantLabel: null,
    unitLabel: "1個",
    category: "その他",
    source: "label",
    per: { kcal: 100, proteinG: 10, fatG: 1, carbG: 1, saltG: 0.1 },
  },
  fromShortcutSetId: null,
  note: "",
} as MealEntry;

function session(logDate: string, startedAt: string): TrainingSession {
  return {
    id: 1,
    menu: "A",
    startedAt,
    startedAtIsEstimated: false,
    logDate,
    note: "",
  } as TrainingSession;
}

const input: ExportInput = {
  range: { start: "2026-09-21", end: "2026-09-23" },
  generatedAt: "2026-09-23T21:00",
  settings,
  days: [
    // 食事とトレーニングがある日
    {
      logDate: "2026-09-21",
      dayType: "gym",
      entries: [entry],
      sessions: [
        { session: session("2026-09-21", "2026-09-21T19:00"), items: [] },
      ],
    },
    // 記録の無い日（詳細には出ない）
    { logDate: "2026-09-22", dayType: "rest", entries: [], sessions: [] },
    // トレーニングだけの日
    {
      logDate: "2026-09-23",
      dayType: "gym",
      entries: [],
      sessions: [
        { session: session("2026-09-23", "2026-09-23T07:30"), items: [] },
      ],
    },
  ],
  bodies: [],
  bodiesOutOfRange: false,
  pendingTexts: [],
};

/** 「## 日ごとの詳細」から次の「## 」の手前までの見出し行 */
function detailHeadings(markdown: string): string[] {
  const lines = markdown.split("\n");
  const start = lines.indexOf("## 日ごとの詳細");
  assert.ok(start >= 0, "「## 日ごとの詳細」が無い");
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const section = end < 0 ? rest : rest.slice(0, end);
  return section.filter((line) => line.startsWith("#"));
}

test("日ごとの詳細の子見出し（各日）は ###、その下のトレーニングは ####", () => {
  const headings = detailHeadings(buildMarkdown(input));
  assert.deepEqual(headings, [
    "### 9/21（月）ジムの日",
    "#### トレーニング A（押す） 19:00 開始",
    "### 9/23（水）ジムの日",
    "#### トレーニング A（押す） 07:30 開始",
  ]);
});

test("各日の見出しが「## 日ごとの詳細」と同じ ## の階層に並ばない", () => {
  const markdown = buildMarkdown(input);
  const level2 = markdown.split("\n").filter((line) => /^## /.test(line));
  assert.deepEqual(level2, [
    "## 前提",
    "## 期間サマリー",
    "## 日ごとの詳細",
    "## 体組成",
    "## 未処理のテキスト",
  ]);
});
