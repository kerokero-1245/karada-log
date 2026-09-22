/**
 * F10: 書き出す期間の決め方。
 *
 * ★ ここは純関数だけ。DB も React も触らない。★
 *   「今日」は引数で受け取る。時計に触らないので単体で確かめられる。
 *
 * 期間はすべて **論理日付**（朝4時境界）で持つ。週の起点は月曜（Settings.weekStartsOn）。
 * 「今週」は 週の起点 〜 今日 で切る。まだ来ていない日を並べても中身が無く、
 * 「未記録」の行だけが増えて読み手が誤読しやすいため。
 */
import type { LogDate } from '../db/types';
import { WEEK_STARTS_ON, addDays, diffDays, formatLogDate, parseIso, weekStartOf } from './date';

export type RangePresetKey = 'thisWeek' | 'lastWeek' | 'last7' | 'last14' | 'custom';

export interface DateRange {
  start: LogDate;
  end: LogDate;
}

export const RANGE_PRESETS: { key: RangePresetKey; label: string }[] = [
  { key: 'thisWeek', label: '今週' },
  { key: 'lastWeek', label: '先週' },
  { key: 'last7', label: '直近7日' },
  { key: 'last14', label: '直近14日' },
  { key: 'custom', label: '日付指定' },
];

/** 既定は「直近7日」 */
export const DEFAULT_RANGE_PRESET: RangePresetKey = 'last7';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isLogDate(value: string): boolean {
  return DATE_PATTERN.test(value) && !Number.isNaN(parseIso(value).getTime());
}

/**
 * 期間を決める。custom は開始・終了が逆でも入れ替えて受け付ける。
 * 読めない日付が来たときは today に寄せる（画面を空にしない）。
 */
export function resolveRange(
  key: RangePresetKey,
  today: LogDate,
  custom: DateRange,
  weekStartsOn: number = WEEK_STARTS_ON,
): DateRange {
  switch (key) {
    case 'thisWeek':
      return { start: weekStartOf(today, weekStartsOn), end: today };
    case 'lastWeek': {
      const lastMonday = addDays(weekStartOf(today, weekStartsOn), -7);
      return { start: lastMonday, end: addDays(lastMonday, 6) };
    }
    case 'last7':
      return { start: addDays(today, -6), end: today };
    case 'last14':
      return { start: addDays(today, -13), end: today };
    case 'custom': {
      const start = isLogDate(custom.start) ? custom.start : today;
      const end = isLogDate(custom.end) ? custom.end : today;
      return start <= end ? { start, end } : { start: end, end: start };
    }
  }
}

/** 期間に含まれる論理日付を古い順に並べる */
export function rangeDates(range: DateRange): LogDate[] {
  const length = Math.max(0, diffDays(range.start, range.end)) + 1;
  return Array.from({ length }, (_, i) => addDays(range.start, i));
}

export function rangeDayCount(range: DateRange): number {
  return Math.max(0, diffDays(range.start, range.end)) + 1;
}

export function inRange(range: DateRange, logDate: LogDate): boolean {
  return logDate >= range.start && logDate <= range.end;
}

/** '2026/09/07〜2026/09/22' */
export function formatRange(range: DateRange): string {
  return `${formatLogDate(range.start).slice(0, 10)}〜${formatLogDate(range.end).slice(0, 10)}`;
}

/** ファイル名用。'20260907-20260922' */
export function rangeFileStamp(range: DateRange): string {
  return `${range.start.replace(/-/g, '')}-${range.end.replace(/-/g, '')}`;
}
