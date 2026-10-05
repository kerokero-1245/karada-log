/**
 * 論理日付（朝4時境界）と週（月曜起点）のヘルパー。
 *
 * 主食が21〜23時で深夜に及ぶことがあるため、0:00〜3:59 の記録は前日に計上する。
 * 「その日」を素朴な暦日で数えると、深夜のラーメンが翌日に乗って
 * 両方の日の集計が壊れる。集計・アラート・週次はすべて LogDate で束ねる。
 */
import type { IsoDateTime, LogDate } from '../db/types';

/** 日付の境界（時）。Settings.dayBoundaryHour の既定値 */
export const DAY_BOUNDARY_HOUR = 4;

/** 週の起点。1 = 月曜 */
export const WEEK_STARTS_ON = 1;

export const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DDTHH:mm'（ローカル時刻） */
export function toIsoDateTime(d: Date): IsoDateTime {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Date → 'YYYY-MM-DD'（暦日。論理日付ではない） */
export function toCalendarDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DDTHH:mm' / 'YYYY-MM-DD' → Date（ローカル時刻として解釈） */
export function parseIso(value: IsoDateTime | LogDate): Date {
  const [datePart, timePart = '00:00'] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

/**
 * 日時 → 論理日付。
 * boundaryHour より前の時刻は前日に寄せる（4時境界なら 02:30 は前日）。
 */
export function toLogDate(at: Date | IsoDateTime, boundaryHour: number = DAY_BOUNDARY_HOUR): LogDate {
  const d = typeof at === 'string' ? parseIso(at) : new Date(at.getTime());
  const shifted = new Date(d.getTime());
  shifted.setHours(shifted.getHours() - boundaryHour);
  return toCalendarDate(shifted);
}

/** 論理日付の開始時刻（= その暦日の boundaryHour 時） */
export function logDateStart(logDate: LogDate, boundaryHour: number = DAY_BOUNDARY_HOUR): Date {
  const d = parseIso(logDate);
  d.setHours(boundaryHour, 0, 0, 0);
  return d;
}

/** 論理日付の終了時刻（= 翌暦日の boundaryHour 時。この値は含まない） */
export function logDateEnd(logDate: LogDate, boundaryHour: number = DAY_BOUNDARY_HOUR): Date {
  const d = logDateStart(logDate, boundaryHour);
  d.setDate(d.getDate() + 1);
  return d;
}

/** 論理日付を n 日ずらす */
export function addDays(logDate: LogDate, n: number): LogDate {
  const d = parseIso(logDate);
  d.setDate(d.getDate() + n);
  return toCalendarDate(d);
}

/** 論理日付の差（b - a）を日数で返す */
export function diffDays(a: LogDate, b: LogDate): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const da = parseIso(a);
  const db = parseIso(b);
  da.setHours(12, 0, 0, 0);
  db.setHours(12, 0, 0, 0);
  return Math.round((db.getTime() - da.getTime()) / msPerDay);
}

/** その論理日付が属する週の起点（既定: 月曜） */
export function weekStartOf(logDate: LogDate, weekStartsOn: number = WEEK_STARTS_ON): LogDate {
  const d = parseIso(logDate);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  return addDays(logDate, -diff);
}

/** その週の7日分の論理日付 */
export function weekDates(logDate: LogDate, weekStartsOn: number = WEEK_STARTS_ON): LogDate[] {
  const start = weekStartOf(logDate, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 現在時刻の論理日付 */
export function todayLogDate(boundaryHour: number = DAY_BOUNDARY_HOUR): LogDate {
  return toLogDate(new Date(), boundaryHour);
}

/** '2026-09-12' → '2026/09/12（土）' */
export function formatLogDate(logDate: LogDate): string {
  const d = parseIso(logDate);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}（${WEEKDAY_JA[d.getDay()]}）`;
}

/** '2026-09-12T21:30' → '2026/09/12（土） 21:30' */
export function formatDateTime(at: IsoDateTime): string {
  const [datePart, timePart = ''] = at.split('T');
  return `${formatLogDate(datePart)} ${timePart}`.trim();
}

/** 2つの日時の差（時間）。小数を返す */
export function diffHours(from: IsoDateTime, to: IsoDateTime): number {
  return (parseIso(to).getTime() - parseIso(from).getTime()) / (60 * 60 * 1000);
}

/* ------------------------------------------------------------------ */
/* F1/F2 で追加（上の既存関数は変更していない）                            */
/* ------------------------------------------------------------------ */

/** '2026-09-20' → '9/20（土）'。見出しが長くならないように月日だけ */
export function formatLogDateShort(logDate: LogDate): string {
  const d = parseIso(logDate);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_JA[d.getDay()]}）`;
}

/** '2026-09-20T21:30' → '21:30' */
export function timeOf(at: IsoDateTime): string {
  const [, time = ''] = at.split('T');
  return time.slice(0, 5);
}

/** 現在時刻 'HH:mm'（<input type="time"> の初期値に使う） */
export function nowTime(): string {
  return toIsoDateTime(new Date()).slice(11, 16);
}

/**
 * 「論理日付 logDate の HH:mm」を実時刻に戻す。
 *
 * 4時境界より前の時刻は、その論理日付の **翌暦日** に置く。
 * 例: 論理日付 2026-09-20 の 01:30 → '2026-09-21T01:30'（集計は 9/20 のまま）。
 * 記録画面で「1:30 → 9/20 の記録になります」と出せるのはこの関数の逆算による。
 */
export function isoDateTimeIn(
  logDate: LogDate,
  time: string,
  boundaryHour: number = DAY_BOUNDARY_HOUR,
): IsoDateTime {
  const hhmm = time.slice(0, 5);
  const hour = Number(hhmm.split(':')[0]);
  const calendarDate = Number.isFinite(hour) && hour < boundaryHour ? addDays(logDate, 1) : logDate;
  return `${calendarDate}T${hhmm}`;
}

/**
 * 時刻欄に 'HH:mm' が入っているか。
 * <input type="time"> は消すと '' になる。空のまま isoDateTimeIn に渡すと
 * 時刻なしの日時（'2026-10-05T'）ができてしまうので、保存の前にこれで止める。
 */
export function hasTime(value: string): boolean {
  return /^\d{2}:\d{2}/.test(value);
}
