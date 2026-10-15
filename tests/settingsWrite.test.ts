/**
 * 設定の書き込み（db/settings.ts）。
 *
 * 目標ラインの保存は Settings の id=1 の行の goal だけを、更新時刻つきで置き換える（ほかの値には触れない）。
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db/db.ts";
import { saveGoalLine } from "../src/db/settings.ts";
import { freezeTime, restoreStubs, stub, unfreezeTime } from "./helpers.ts";

afterEach(() => {
  restoreStubs();
  unfreezeTime();
});

test("settings.saveGoalLine: Settings の id=1 の行の goal だけを、更新時刻つきで書く", async () => {
  freezeTime(new Date(2026, 9, 15, 21, 30));
  const updates: unknown[][] = [];
  stub(db.settings, "update", async (...args: unknown[]) => {
    updates.push(args);
    return 1;
  });
  const goal = {
    fatMassKg: 14.2,
    leanMassKg: 58.6,
    targetDate: "2026-12-05",
    label: "2026年12月5日",
  };
  await saveGoalLine(goal);
  assert.deepEqual(updates, [[1, { goal, updatedAt: "2026-10-15T21:30" }]]);
});
