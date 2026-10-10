/**
 * 日の区分（lib/day.ts）の今の出力を固定する特性テスト。
 *
 * 区分の決め方: 手動（DayMeta の source='manual'）が最優先 → トレ記録が 1 件でもあれば「ジムの日」→
 * それ以外は「休養日」。値は架空のサンプル。
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db/db.ts";
import type { DayMeta } from "../src/db/types.ts";
import {
  clearManualDayType,
  resolveDayType,
  setManualDayType,
} from "../src/lib/day.ts";
import { freezeTime, restoreStubs, stub, unfreezeTime } from "./helpers.ts";

afterEach(() => {
  restoreStubs();
  unfreezeTime();
});

function meta(overrides: Partial<DayMeta> = {}): DayMeta {
  return {
    logDate: "2026-09-21",
    dayType: "gym",
    source: "manual",
    note: "",
    updatedAt: "2026-09-21T08:00",
    ...overrides,
  };
}

test("day.resolveDayType: 手動の指定が最優先（トレの件数に関わらず）", () => {
  assert.deepEqual(resolveDayType(meta({ dayType: "rest" }), 3), {
    dayType: "rest",
    source: "manual",
  });
  assert.deepEqual(resolveDayType(meta({ dayType: "gym" }), 0), {
    dayType: "gym",
    source: "manual",
  });
});

test("day.resolveDayType: 手動でなければトレ記録の有無で自動判定する", () => {
  assert.deepEqual(resolveDayType(undefined, 1), {
    dayType: "gym",
    source: "auto",
  });
  assert.deepEqual(resolveDayType(undefined, 0), {
    dayType: "rest",
    source: "auto",
  });
  // 自動の行（source='auto'）があっても、判定はトレの件数
  assert.deepEqual(
    resolveDayType(meta({ source: "auto", dayType: "rest" }), 2),
    {
      dayType: "gym",
      source: "auto",
    },
  );
});

test("day.setManualDayType / clearManualDayType: 手動の行を書く・消す", async () => {
  freezeTime(new Date(2026, 9, 11, 3, 4));
  const puts: unknown[] = [];
  const deletes: unknown[] = [];
  stub(db.dayMeta, "put", async (row: unknown) => {
    puts.push(row);
    return "2026-10-10";
  });
  stub(db.dayMeta, "delete", async (key: unknown) => {
    deletes.push(key);
  });

  await setManualDayType("2026-10-10", "gym");
  await clearManualDayType("2026-10-10");
  assert.deepEqual(puts, [
    {
      logDate: "2026-10-10",
      dayType: "gym",
      source: "manual",
      note: "画面で手動切替",
      updatedAt: "2026-10-11T03:04",
    },
  ]);
  assert.deepEqual(Object.keys(puts[0] ?? {}), [
    "logDate",
    "dayType",
    "source",
    "note",
    "updatedAt",
  ]);
  assert.deepEqual(deletes, ["2026-10-10"]);
});
