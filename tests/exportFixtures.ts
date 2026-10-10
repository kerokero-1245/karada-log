/**
 * Markdown 書き出しの全文テスト（exportMarkdownGolden.test.ts）と、DB から集める側
 * （exportData.test.ts）で共通に使う入力の見本。値はすべて架空のサンプル。
 *
 * テストの本体ではない（*.test.ts ではないので node --test の対象にならない）。
 */
import type { ExportDay, ExportInput } from "../src/lib/exportMarkdown.ts";
import {
  bodyFixture,
  foodFixture,
  mealEntryFixture,
  sessionExerciseFixture,
  sessionFixture,
  setRecordFixture,
  settingsFixture,
  snapshotFixture,
} from "./helpers.ts";

const protein = foodFixture({
  id: 1,
  name: "ザバス MILK PROTEIN",
  unitLabel: "1本(240ml)",
  per: { kcal: 138, proteinG: 25, fatG: 0, carbG: null, saltG: 0.31 },
  category: "プロテイン",
});
const cupSoupLeft = foodFixture({
  id: 3,
  name: "カップヌードル BIG",
  category: "麺類",
  variantGroupId: "cupnoodle-big",
  variantLabel: "スープ残し",
  per: { kcal: 300, proteinG: 10, fatG: 12, carbG: 40, saltG: 3 },
});
const smoothie = foodFixture({
  id: 9,
  name: "ゴールドジム スムージー",
  unitLabel: "1杯",
  per: { kcal: 300, proteinG: 30, fatG: 0, carbG: null, saltG: null },
  category: "飲料",
});
const estimatedBowl = foodFixture({
  id: 21,
  name: "謎の丼",
  source: "estimated",
  per: { kcal: 650, proteinG: 22.5, fatG: 18.25, carbG: 90, saltG: 2.4 },
  category: "主食",
});

/**
 * 期間 2026-09-21（月）〜 2026-09-30（水）の 10 日。週は 2 つに分かれ、後ろの週は 3 日だけ。
 * 食事のある日・無い日・トレだけの日・脂質が少ない日・塩分が高い日・未確認の値がある日を含む。
 */
export function richExportInput(): ExportInput {
  const days: ExportDay[] = [
    {
      logDate: "2026-09-21",
      dayType: "gym",
      entries: [
        mealEntryFixture({
          id: 1,
          quantity: 2,
          recordedAt: "2026-09-21T08:00",
          logDate: "2026-09-21",
          snapshot: snapshotFixture(protein),
          fromShortcutSetId: 1,
        }),
        mealEntryFixture({
          id: 2,
          quantity: 1,
          recordedAt: "2026-09-21T12:30",
          logDate: "2026-09-21",
          snapshot: snapshotFixture(cupSoupLeft),
          note: "カップヌードル BIG 1個",
        }),
        mealEntryFixture({
          id: 3,
          quantity: 1,
          recordedAt: "2026-09-21T15:10",
          logDate: "2026-09-21",
          snapshot: snapshotFixture(smoothie),
        }),
      ],
      sessions: [
        {
          session: sessionFixture({
            id: 1,
            logDate: "2026-09-21",
            startedAt: "2026-09-21T19:00",
            note: "肩が重い日",
          }),
          items: [
            {
              item: sessionExerciseFixture({
                id: 1,
                sessionId: 1,
                order: 1,
                note: "順番が1番目",
              }),
              sets: [
                setRecordFixture({
                  id: 1,
                  sessionExerciseId: 1,
                  setNo: 1,
                  reps: 10,
                }),
                setRecordFixture({
                  id: 2,
                  sessionExerciseId: 1,
                  setNo: 2,
                  reps: 10,
                }),
                setRecordFixture({
                  id: 3,
                  sessionExerciseId: 1,
                  setNo: 3,
                  reps: 9,
                  achieved: false,
                }),
              ],
            },
            {
              item: sessionExerciseFixture({
                id: 2,
                sessionId: 1,
                exerciseId: 2,
                order: 2,
                exerciseName: "ファーマーズウォーク",
                load: { style: "dumbbell", kgPerHand: 16, hands: 2 },
                outcome: "achieved",
              }),
              sets: [
                setRecordFixture({
                  id: 4,
                  sessionExerciseId: 2,
                  setNo: 1,
                  reps: null,
                  seconds: 40,
                }),
              ],
            },
            {
              item: sessionExerciseFixture({
                id: 3,
                sessionId: 1,
                exerciseId: 3,
                order: 3,
                exerciseName: "ライイングエクステンション",
                load: {
                  style: "other",
                  totalKg: 20,
                  description: "構成未確認",
                },
                outcome: "held",
              }),
              sets: [],
            },
          ],
        },
      ],
    },
    { logDate: "2026-09-22", dayType: "rest", entries: [], sessions: [] },
    {
      logDate: "2026-09-23",
      dayType: "rest",
      entries: [
        mealEntryFixture({
          id: 4,
          quantity: 1,
          recordedAt: "2026-09-23T13:00",
          logDate: "2026-09-23",
          snapshot: snapshotFixture(estimatedBowl),
          note: "丼|大盛り\n(改行あり)",
        }),
      ],
      sessions: [],
    },
    {
      logDate: "2026-09-24",
      dayType: "gym",
      entries: [],
      sessions: [
        {
          session: sessionFixture({
            id: 2,
            menu: "B",
            logDate: "2026-09-24",
            startedAt: "2026-09-24T07:30",
            startedAtIsEstimated: true,
          }),
          items: [],
        },
      ],
    },
    {
      logDate: "2026-09-25",
      dayType: "rest",
      entries: [
        mealEntryFixture({
          id: 5,
          quantity: 3,
          recordedAt: "2026-09-25T20:00",
          logDate: "2026-09-25",
          snapshot: snapshotFixture(cupSoupLeft),
        }),
        mealEntryFixture({
          id: 6,
          quantity: 1.5,
          recordedAt: "2026-09-25T21:15",
          logDate: "2026-09-25",
          snapshot: snapshotFixture(estimatedBowl),
        }),
      ],
      sessions: [],
    },
    { logDate: "2026-09-26", dayType: "rest", entries: [], sessions: [] },
    { logDate: "2026-09-27", dayType: "rest", entries: [], sessions: [] },
    {
      logDate: "2026-09-28",
      dayType: "rest",
      entries: [
        mealEntryFixture({
          id: 7,
          quantity: 1,
          recordedAt: "2026-09-28T09:00",
          logDate: "2026-09-28",
          snapshot: snapshotFixture(protein),
        }),
      ],
      sessions: [],
    },
    { logDate: "2026-09-29", dayType: "rest", entries: [], sessions: [] },
    { logDate: "2026-09-30", dayType: "rest", entries: [], sessions: [] },
  ];

  return {
    range: { start: "2026-09-21", end: "2026-09-30" },
    generatedAt: "2026-09-30T21:00",
    settings: settingsFixture(),
    days,
    bodies: [
      bodyFixture({
        id: 1,
        measuredAt: "2026-09-20T08:00",
        weightKg: 70,
        bodyFatPercent: 18.5,
        fatMassKg: 12.95,
        leanMassKg: 57.05,
        bmrKcal: 1600,
        visceralFatLevel: 5,
      }),
      bodyFixture({
        id: 2,
        measuredAt: "2026-09-27T08:30",
        device: "別の体組成計",
        weightKg: null,
        bodyFatPercent: null,
        fatMassKg: 11.8,
        leanMassKg: null,
        bmrKcal: null,
        visceralFatLevel: null,
        warnings: [
          {
            code: "training_gap_lt3",
            severity: "high",
            message:
              "最後のトレーニングから1日です（3日以上空けたい条件）。水分で重く出ます",
          },
          {
            code: "meal_timing_unknown",
            severity: "info",
            message: "直前の食事からの経過時間が未記録です",
          },
        ],
      }),
    ],
    bodiesOutOfRange: false,
    pendingTexts: [
      {
        id: 1,
        text: "謎の品 2個",
        reason: "見つかりませんでした",
        logDate: "2026-09-23",
        recordedAt: "2026-09-23T21:30",
        createdAt: "2026-09-23T21:31",
      },
      {
        id: 2,
        text: "ヨーグルト",
        reason: "候補から選べていません",
        logDate: "2026-09-25",
        recordedAt: "2026-09-25T10:00",
        createdAt: "2026-09-25T10:01",
      },
    ],
  };
}

/** 記録がまったく無い 1 日だけの期間（「なし」の分岐と、期間外の体組成の参考行） */
export function emptyExportInput(): ExportInput {
  return {
    range: { start: "2026-09-22", end: "2026-09-22" },
    generatedAt: "2026-09-22T21:00",
    settings: settingsFixture(),
    days: [
      { logDate: "2026-09-22", dayType: "rest", entries: [], sessions: [] },
    ],
    bodies: [],
    bodiesOutOfRange: false,
    pendingTexts: [],
  };
}

/** 期間内に測定が無く、期間外の最新 1 件を参考として出している入力 */
export function outOfRangeBodyInput(): ExportInput {
  return {
    ...emptyExportInput(),
    bodies: [bodyFixture({ id: 3, measuredAt: "2026-08-30T08:00" })],
    bodiesOutOfRange: true,
  };
}
