/**
 * 種目の結果の表示名（db/types.ts の OUTCOME_LABELS）。
 *
 * 限界までの種目（アブローラーなど）は進捗の判定をしないので、結果は 'unknown'。
 * 書き出しの「→ ○○」には、「記録が無い」ではなく「判定をしていない」と出す（記録は回数として残っている）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { OUTCOME_LABELS } from "../src/db/types.ts";
import { buildMarkdown } from "../src/lib/exportMarkdown.ts";
import { richExportInput } from "./exportFixtures.ts";
import {
  sessionExerciseFixture,
  sessionFixture,
  setRecordFixture,
} from "./helpers.ts";

test("types.OUTCOME_LABELS: 達成・据え置き・判定なし", () => {
  assert.deepEqual(OUTCOME_LABELS, {
    achieved: "達成",
    held: "据え置き",
    unknown: "判定なし",
  });
});

test("exportMarkdown: 結果が unknown の種目は「→ 判定なし」と出す（回数は別に出る）", () => {
  const input = richExportInput();
  const session = sessionFixture({
    id: 90,
    logDate: "2026-09-22",
    startedAt: "2026-09-22T19:00",
  });
  const item = sessionExerciseFixture({
    id: 900,
    sessionId: 90,
    exerciseName: "アブローラー",
    load: { style: "bodyweight", addedKg: null },
    outcome: "unknown",
  });
  const sets = [
    setRecordFixture({ sessionExerciseId: 900, setNo: 1, reps: 22 }),
    setRecordFixture({ sessionExerciseId: 900, setNo: 2, reps: 18 }),
  ];
  const days = input.days.map((day) =>
    day.logDate === "2026-09-22"
      ? { ...day, sessions: [{ session, items: [{ item, sets }] }] }
      : day,
  );
  const markdown = buildMarkdown({ ...input, days });
  assert.ok(markdown.includes("- アブローラー 自重× 22,18 → 判定なし"));
  assert.ok(!markdown.includes("記録なし"));
});
