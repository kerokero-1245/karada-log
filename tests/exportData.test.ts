/**
 * Markdown に出すデータを DB から集める（lib/exportData.ts の collectExport）の今の出力を固定する特性テスト。
 *
 * 読み出しだけで、書き込みはしない。期間の全日を日付順に並べ、日の区分（手動 → トレの有無）・食事・
 * トレーニング（種目は実施順、セットは setNo 順）を日ごとにまとめ、体組成は期間内（無ければ最新 1 件を参考）、
 * 未処理のテキストは期間内だけを返す。Node には IndexedDB が無いので、表を tests/fakeTable.ts の
 * メモリ上の表に差し替える。値は架空のサンプル。
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db/db.ts";
import type {
  BodyComposition,
  DayMeta,
  MealEntry,
  PendingText,
  SessionExercise,
  SetRecord,
  TrainingSession,
} from "../src/db/types.ts";
import { collectExport } from "../src/lib/exportData.ts";
import { buildMarkdown } from "../src/lib/exportMarkdown.ts";
import { fakeTable } from "./fakeTable.ts";
import {
  bodyFixture,
  freezeTime,
  mealEntryFixture,
  restoreStubs,
  sessionExerciseFixture,
  sessionFixture,
  setRecordFixture,
  settingsFixture,
  unfreezeTime,
} from "./helpers.ts";

afterEach(() => {
  restoreStubs();
  unfreezeTime();
});

const RANGE = { start: "2026-09-21", end: "2026-09-23" };

function pending(id: number, logDate: string): PendingText {
  return {
    id,
    text: `未処理 ${id}`,
    reason: "見つかりませんでした",
    logDate,
    recordedAt: `${logDate}T12:00`,
    createdAt: `${logDate}T12:01`,
  };
}

/** 3 日間（9/21 月・9/22 火・9/23 水）の表の中身を用意する */
function installTables(overrides: { bodies?: BodyComposition[] } = {}) {
  fakeTable<MealEntry>(db.mealEntries, [
    // わざと時刻順でなく入れる
    mealEntryFixture({
      id: 1,
      recordedAt: "2026-09-21T12:00",
      logDate: "2026-09-21",
    }),
    mealEntryFixture({
      id: 2,
      recordedAt: "2026-09-21T08:00",
      logDate: "2026-09-21",
    }),
    mealEntryFixture({
      id: 3,
      recordedAt: "2026-09-23T21:00",
      logDate: "2026-09-23",
    }),
    mealEntryFixture({
      id: 4,
      recordedAt: "2026-09-20T21:00",
      logDate: "2026-09-20",
    }),
    mealEntryFixture({
      id: 5,
      recordedAt: "2026-09-24T07:00",
      logDate: "2026-09-24",
    }),
  ]);
  fakeTable<TrainingSession>(db.trainingSessions, [
    sessionFixture({
      id: 1,
      logDate: "2026-09-21",
      startedAt: "2026-09-21T19:00",
    }),
    sessionFixture({
      id: 2,
      menu: "B",
      logDate: "2026-09-22",
      startedAt: "2026-09-22T19:00",
    }),
    sessionFixture({
      id: 3,
      menu: "C",
      logDate: "2026-09-22",
      startedAt: "2026-09-22T07:00",
    }),
    sessionFixture({
      id: 4,
      logDate: "2026-09-19",
      startedAt: "2026-09-19T19:00",
    }),
  ]);
  fakeTable<SessionExercise>(db.sessionExercises, [
    sessionExerciseFixture({
      id: 1,
      sessionId: 1,
      order: 2,
      exerciseName: "二番目",
    }),
    sessionExerciseFixture({
      id: 2,
      sessionId: 1,
      order: 1,
      exerciseName: "一番目",
    }),
    sessionExerciseFixture({
      id: 3,
      sessionId: 2,
      order: 1,
      exerciseName: "B の種目",
    }),
    sessionExerciseFixture({
      id: 4,
      sessionId: 4,
      order: 1,
      exerciseName: "期間外",
    }),
  ]);
  fakeTable<SetRecord>(db.setRecords, [
    setRecordFixture({ id: 1, sessionExerciseId: 2, setNo: 2, reps: 9 }),
    setRecordFixture({ id: 2, sessionExerciseId: 2, setNo: 1, reps: 10 }),
    setRecordFixture({ id: 3, sessionExerciseId: 1, setNo: 1, reps: 8 }),
    setRecordFixture({ id: 4, sessionExerciseId: 3, setNo: 1, reps: 7 }),
    setRecordFixture({ id: 5, sessionExerciseId: 4, setNo: 1, reps: 6 }),
  ]);
  fakeTable<DayMeta>(
    db.dayMeta,
    [
      // 9/21 はトレがあるが手動で休養日にしている。期間外の行は読まない
      {
        logDate: "2026-09-21",
        dayType: "rest",
        source: "manual",
        note: "",
        updatedAt: "2026-09-21T08:00",
      },
      {
        logDate: "2026-09-20",
        dayType: "gym",
        source: "manual",
        note: "",
        updatedAt: "2026-09-20T08:00",
      },
    ],
    "logDate",
  );
  fakeTable<BodyComposition>(db.bodyCompositions, overrides.bodies ?? []);
  fakeTable<PendingText>(db.pendingTexts, [
    pending(1, "2026-09-20"),
    pending(2, "2026-09-22"),
    pending(3, "2026-09-23"),
    pending(4, "2026-09-24"),
  ]);
}

test("exportData.collectExport: 期間の全日を日付順に並べ、区分・食事・トレをまとめる", async () => {
  freezeTime(new Date(2026, 8, 30, 21, 0));
  installTables();
  const settings = settingsFixture();

  const input = await collectExport(RANGE, settings);

  assert.deepEqual(Object.keys(input), [
    "range",
    "generatedAt",
    "settings",
    "days",
    "bodies",
    "bodiesOutOfRange",
    "pendingTexts",
  ]);
  assert.deepEqual(input.range, RANGE);
  assert.equal(input.generatedAt, "2026-09-30T21:00");
  assert.equal(input.settings, settings);
  assert.deepEqual(
    input.days.map((day) => ({
      logDate: day.logDate,
      dayType: day.dayType,
      entries: day.entries.map((entry) => entry.id),
      sessions: day.sessions.map((entry) => ({
        session: entry.session.id,
        items: entry.items.map((row) => ({
          item: row.item.id,
          sets: row.sets.map((set) => set.id),
        })),
      })),
    })),
    [
      // 手動の指定が最優先（トレがあっても休養日）。食事は時刻順
      {
        logDate: "2026-09-21",
        dayType: "rest",
        entries: [2, 1],
        sessions: [
          {
            session: 1,
            // 種目は実施順、セットは setNo 順
            items: [
              { item: 2, sets: [2, 1] },
              { item: 1, sets: [3] },
            ],
          },
        ],
      },
      // トレがある日は自動で「ジムの日」。同じ日のセッションは開始時刻順
      {
        logDate: "2026-09-22",
        dayType: "gym",
        entries: [],
        sessions: [
          { session: 3, items: [] },
          { session: 2, items: [{ item: 3, sets: [4] }] },
        ],
      },
      { logDate: "2026-09-23", dayType: "rest", entries: [3], sessions: [] },
    ],
  );
});

test("exportData.collectExport: 体組成が無ければ空、未処理のテキストは期間内だけ", async () => {
  freezeTime(new Date(2026, 8, 30, 21, 0));
  installTables();
  const input = await collectExport(RANGE, settingsFixture());
  assert.deepEqual(input.bodies, []);
  assert.equal(input.bodiesOutOfRange, false);
  assert.deepEqual(
    input.pendingTexts.map((item) => item.id),
    [2, 3],
  );
});

test("exportData.collectExport: 体組成は期間内の測定。無ければ最新 1 件を「期間外の参考」として返す（朝 4 時境界で日付を決める）", async () => {
  freezeTime(new Date(2026, 8, 30, 21, 0));
  // 期間内: 9/22 の 08:00 と、9/24 の 03:00（論理日付は 9/23 なので期間内）。9/25 の 08:00 は期間外
  installTables({
    bodies: [
      bodyFixture({ id: 1, measuredAt: "2026-09-10T08:00" }),
      bodyFixture({ id: 2, measuredAt: "2026-09-22T08:00" }),
      bodyFixture({ id: 3, measuredAt: "2026-09-24T03:00" }),
      bodyFixture({ id: 4, measuredAt: "2026-09-25T08:00" }),
    ],
  });
  const inside = await collectExport(RANGE, settingsFixture());
  assert.deepEqual(
    inside.bodies.map((body) => body.id),
    [2, 3],
  );
  assert.equal(inside.bodiesOutOfRange, false);

  // 期間内に測定が無い → 時刻順の最後（最新）の 1 件
  restoreStubs();
  installTables({
    bodies: [
      bodyFixture({ id: 1, measuredAt: "2026-09-10T08:00" }),
      bodyFixture({ id: 4, measuredAt: "2026-09-25T08:00" }),
    ],
  });
  const outside = await collectExport(RANGE, settingsFixture());
  assert.deepEqual(
    outside.bodies.map((body) => body.id),
    [4],
  );
  assert.equal(outside.bodiesOutOfRange, true);
});

test("exportData.collectExport: 集めた入力をそのまま Markdown にできる（トレの種目・回数が出る）", async () => {
  freezeTime(new Date(2026, 8, 30, 21, 0));
  installTables();
  const markdown = buildMarkdown(await collectExport(RANGE, settingsFixture()));
  assert.ok(markdown.includes("#### トレーニング A（押す） 19:00 開始"));
  assert.ok(markdown.includes("× 10,9 → 達成"));
  assert.ok(markdown.includes("- 一番目 "));
  assert.ok(markdown.indexOf("- 一番目 ") < markdown.indexOf("- 二番目 "));
});
