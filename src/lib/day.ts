/**
 * 「今日」（論理日付）と、その日の区分（ジムの日 / 休養日）。
 *
 * 区分の決め方:
 *   1. DayMeta に source='manual' の行があればそれを使う（手動が最優先）
 *   2. 無ければ、その論理日付に TrainingSession が1件でもあれば「ジムの日」
 *   3. どちらでもなければ「休養日」
 */
import { useEffect, useState } from 'react';
import { db } from '../db/db';
import type { DayMeta, DayType, LogDate } from '../db/types';
import { DAY_BOUNDARY_HOUR, toIsoDateTime, todayLogDate } from './date';

/**
 * 現在時刻の論理日付。1分ごとに評価し直すので、
 * 画面を開いたまま朝4時をまたぐと自動で翌日に切り替わる。
 */
export function useTodayLogDate(boundaryHour: number = DAY_BOUNDARY_HOUR): LogDate {
  const [logDate, setLogDate] = useState<LogDate>(() => todayLogDate(boundaryHour));

  useEffect(() => {
    const timer = setInterval(() => {
      setLogDate((prev) => {
        const next = todayLogDate(boundaryHour);
        return next === prev ? prev : next;
      });
    }, 60_000);
    return () => clearInterval(timer);
  }, [boundaryHour]);

  return logDate;
}

export interface ResolvedDayType {
  dayType: DayType;
  /** 'manual' = ユーザーが切り替えた / 'auto' = トレ記録の有無から判定 */
  source: 'auto' | 'manual';
}

export function resolveDayType(meta: DayMeta | undefined, trainingCount: number): ResolvedDayType {
  if (meta && meta.source === 'manual') {
    return { dayType: meta.dayType, source: 'manual' };
  }
  return { dayType: trainingCount > 0 ? 'gym' : 'rest', source: 'auto' };
}

/** 手動で区分を切り替える */
export async function setManualDayType(logDate: LogDate, dayType: DayType): Promise<void> {
  await db.dayMeta.put({
    logDate,
    dayType,
    source: 'manual',
    note: '画面で手動切替',
    updatedAt: toIsoDateTime(new Date()),
  });
}

/** 手動指定をやめて自動判定に戻す */
export async function clearManualDayType(logDate: LogDate): Promise<void> {
  await db.dayMeta.delete(logDate);
}
