/**
 * F10: Markdown に出すデータを DB から集める。
 *
 * 文字列の組み立ては lib/exportMarkdown.ts（純関数）に任せる。ここは読み出しだけ。
 * 書き込みは一切しない。書き出しが記録を変えることは無い。
 */
import { db } from '../db/db';
import type { BodyComposition, LogDate, PendingText, SetRecord, Settings } from '../db/types';
import { toIsoDateTime, toLogDate } from './date';
import { resolveDayType } from './day';
import type { DateRange } from './exportRange';
import { inRange, rangeDates } from './exportRange';
import type { ExportDay, ExportInput, ExportSession } from './exportMarkdown';

export async function collectExport(range: DateRange, settings: Settings): Promise<ExportInput> {
  const dates = rangeDates(range);

  const [entries, sessions, dayMetaRows, bodies, pendingAll] = await Promise.all([
    db.mealEntries.where('logDate').between(range.start, range.end, true, true).sortBy('recordedAt'),
    db.trainingSessions.where('logDate').between(range.start, range.end, true, true).sortBy('startedAt'),
    db.dayMeta.where('logDate').between(range.start, range.end, true, true).toArray(),
    db.bodyCompositions.orderBy('measuredAt').toArray(),
    db.pendingTexts.orderBy('recordedAt').toArray(),
  ]);

  const sessionIds = sessions.map((s) => s.id).filter((id): id is number => id !== undefined);
  const sessionExercises =
    sessionIds.length === 0 ? [] : await db.sessionExercises.where('sessionId').anyOf(sessionIds).toArray();
  const sessionExerciseIds = sessionExercises
    .map((item) => item.id)
    .filter((id): id is number => id !== undefined);
  const setRecords =
    sessionExerciseIds.length === 0
      ? []
      : await db.setRecords.where('sessionExerciseId').anyOf(sessionExerciseIds).toArray();

  const setsByExercise = new Map<number, SetRecord[]>();
  for (const record of setRecords) {
    const list = setsByExercise.get(record.sessionExerciseId);
    if (list) list.push(record);
    else setsByExercise.set(record.sessionExerciseId, [record]);
  }
  for (const list of setsByExercise.values()) list.sort((a, b) => a.setNo - b.setNo);

  const sessionsByDate = new Map<LogDate, ExportSession[]>();
  for (const session of sessions) {
    const items = sessionExercises
      .filter((item) => item.sessionId === session.id)
      .sort((a, b) => a.order - b.order)
      .map((item) => ({ item, sets: item.id === undefined ? [] : (setsByExercise.get(item.id) ?? []) }));
    const list = sessionsByDate.get(session.logDate);
    const value: ExportSession = { session, items };
    if (list) list.push(value);
    else sessionsByDate.set(session.logDate, [value]);
  }

  const metaByDate = new Map(dayMetaRows.map((row) => [row.logDate, row]));

  const days: ExportDay[] = dates.map((logDate) => {
    const daySessions = sessionsByDate.get(logDate) ?? [];
    const { dayType } = resolveDayType(metaByDate.get(logDate), daySessions.length);
    return {
      logDate,
      dayType,
      entries: entries.filter((entry) => entry.logDate === logDate),
      sessions: daySessions,
    };
  });

  const { bodiesInRange, bodiesOutOfRange } = pickBodies(bodies, range, settings.dayBoundaryHour);
  const pendingTexts: PendingText[] = pendingAll.filter((item) => inRange(range, item.logDate));

  return {
    range,
    generatedAt: toIsoDateTime(new Date()),
    settings,
    days,
    bodies: bodiesInRange,
    bodiesOutOfRange,
    pendingTexts,
  };
}

/**
 * 期間内の測定。無ければ最新1件だけを「参考（期間外）」として出す。
 * 体組成は毎月1回程度なので、期間で切ると何も出ない書き出しになりやすい。
 * 目標ラインとの距離は常に見えているほうがよい。
 */
function pickBodies(
  bodies: BodyComposition[],
  range: DateRange,
  boundaryHour: number,
): { bodiesInRange: BodyComposition[]; bodiesOutOfRange: boolean } {
  const inside = bodies.filter((body) => inRange(range, toLogDate(body.measuredAt, boundaryHour)));
  if (inside.length > 0) return { bodiesInRange: inside, bodiesOutOfRange: false };
  const latest = bodies.length === 0 ? [] : [bodies[bodies.length - 1]];
  return { bodiesInRange: latest, bodiesOutOfRange: latest.length > 0 };
}
