/**
 * その日の区分（ジムの日 / 休養日）。「今日」の論理日付は lib/useTodayLogDate.ts。
 *
 * 区分の決め方:
 *   1. DayMeta に source='manual' の行があればそれを使う（手動が最優先）
 *   2. 無ければ、その論理日付に TrainingSession が1件でもあれば「ジムの日」
 *   3. どちらでもなければ「休養日」
 */
import { db } from "../db/db";
import type { DayMeta, DayType, LogDate } from "../db/types";
import { nowIso } from "./date";

export interface ResolvedDayType {
  dayType: DayType;
  /** 'manual' = ユーザーが切り替えた / 'auto' = トレ記録の有無から判定 */
  source: "auto" | "manual";
}

export function resolveDayType(
  meta: DayMeta | undefined,
  trainingCount: number,
): ResolvedDayType {
  if (meta && meta.source === "manual") {
    return { dayType: meta.dayType, source: "manual" };
  }
  return { dayType: trainingCount > 0 ? "gym" : "rest", source: "auto" };
}

/** 手動で区分を切り替える */
export async function setManualDayType(
  logDate: LogDate,
  dayType: DayType,
): Promise<void> {
  await db.dayMeta.put({
    logDate,
    dayType,
    source: "manual",
    note: "画面で手動切替",
    updatedAt: nowIso(),
  });
}

/** 手動指定をやめて自動判定に戻す */
export async function clearManualDayType(logDate: LogDate): Promise<void> {
  await db.dayMeta.delete(logDate);
}
