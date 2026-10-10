/**
 * 論理日付（朝 4 時境界）と週（月曜起点）のヘルパー（lib/date.ts）の今の出力を固定する特性テスト。
 *
 * 日付はすべてローカル時刻で組み立てる（new Date(年, 月, 日, 時, 分)）ので、
 * テストを動かす環境のタイムゾーンによらず同じ結果になる。値は架空のサンプル。
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_BOUNDARY_HOUR,
  WEEKDAY_JA,
  WEEK_STARTS_ON,
  addDays,
  compactDate,
  diffDays,
  formatDateTime,
  formatLogDate,
  formatLogDateShort,
  formatSlashDate,
  hasTime,
  isoDateTimeIn,
  nowIso,
  nowTime,
  pad2,
  parseIso,
  timeOf,
  toCalendarDate,
  toIsoDateTime,
  toLogDate,
  todayLogDate,
  weekStartOf,
  weekdayOf,
} from "../src/lib/date.ts";
import { freezeTime, unfreezeTime } from "./helpers.ts";

afterEach(() => unfreezeTime());

test("date: 既定の境界は 4 時、週の起点は月曜（1）、曜日の並びは日曜から", () => {
  assert.equal(DAY_BOUNDARY_HOUR, 4);
  assert.equal(WEEK_STARTS_ON, 1);
  assert.deepEqual([...WEEKDAY_JA], ["日", "月", "火", "水", "木", "金", "土"]);
});

test("date.toIsoDateTime / toCalendarDate: ローカル時刻を 0 埋めで文字列にする", () => {
  assert.equal(toIsoDateTime(new Date(2026, 8, 5, 7, 3)), "2026-09-05T07:03");
  assert.equal(
    toIsoDateTime(new Date(2026, 11, 31, 23, 59)),
    "2026-12-31T23:59",
  );
  assert.equal(toCalendarDate(new Date(2026, 0, 2, 23, 59)), "2026-01-02");
});

test("date.parseIso: 日時も日付だけもローカル時刻として読む（時刻が読めなければ 0 時）", () => {
  const parts = (value: string) => {
    const at = parseIso(value);
    return [
      at.getFullYear(),
      at.getMonth() + 1,
      at.getDate(),
      at.getHours(),
      at.getMinutes(),
    ];
  };
  assert.deepEqual(parts("2026-09-05T07:03"), [2026, 9, 5, 7, 3]);
  assert.deepEqual(parts("2026-09-05"), [2026, 9, 5, 0, 0]);
  assert.deepEqual(parts("2026-09-05Txx:yy"), [2026, 9, 5, 0, 0]);
});

test("date.toLogDate: 境界より前の時刻は前日に寄せる", () => {
  assert.equal(toLogDate("2026-09-21T03:59"), "2026-09-20");
  assert.equal(toLogDate("2026-09-21T04:00"), "2026-09-21");
  assert.equal(toLogDate("2026-09-21T00:00"), "2026-09-20");
  assert.equal(toLogDate("2026-09-21T23:59"), "2026-09-21");
  assert.equal(toLogDate("2026-01-01T03:00"), "2025-12-31");
  // 境界の時刻は引数で変えられる。0 時境界なら暦日どおり
  assert.equal(toLogDate("2026-09-21T05:30", 6), "2026-09-20");
  assert.equal(toLogDate("2026-09-21T00:00", 0), "2026-09-21");
  // Date も受け取れる
  assert.equal(toLogDate(new Date(2026, 8, 21, 2, 30)), "2026-09-20");
});

test("date.addDays / diffDays: 月末・年またぎ・うるう日を越えても日付どおり", () => {
  assert.equal(addDays("2026-09-30", 1), "2026-10-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2026-09-21", 0), "2026-09-21");
  assert.equal(addDays("2026-09-21", 14), "2026-10-05");
  assert.equal(diffDays("2026-09-01", "2026-09-22"), 21);
  assert.equal(diffDays("2026-09-22", "2026-09-01"), -21);
  assert.equal(diffDays("2026-09-22", "2026-09-22"), 0);
  assert.equal(diffDays("2025-12-31", "2026-01-01"), 1);
});

test("date.weekStartOf: 既定は月曜起点。日曜は前の週に入る。起点は引数で変えられる", () => {
  // 2026-09-21 は月曜
  assert.equal(weekStartOf("2026-09-21"), "2026-09-21");
  assert.equal(weekStartOf("2026-09-23"), "2026-09-21");
  assert.equal(weekStartOf("2026-09-27"), "2026-09-21");
  assert.equal(weekStartOf("2026-09-28"), "2026-09-28");
  assert.equal(weekStartOf("2026-09-20"), "2026-09-14");
  // 日曜起点
  assert.equal(weekStartOf("2026-09-21", 0), "2026-09-20");
  assert.equal(weekStartOf("2026-09-27", 0), "2026-09-27");
  // 水曜起点
  assert.equal(weekStartOf("2026-09-21", 3), "2026-09-16");
  assert.equal(weekStartOf("2026-09-24", 3), "2026-09-23");
});

test("date.todayLogDate / nowTime: 現在時刻から論理日付と HH:mm を作る", () => {
  freezeTime(new Date(2026, 8, 21, 3, 59));
  assert.equal(todayLogDate(), "2026-09-20");
  assert.equal(nowTime(), "03:59");

  freezeTime(new Date(2026, 8, 21, 4, 0));
  assert.equal(todayLogDate(), "2026-09-21");
  assert.equal(nowTime(), "04:00");
  assert.equal(todayLogDate(6), "2026-09-20");
});

test("date.formatLogDate / formatLogDateShort / formatDateTime / timeOf: 表示用の書き方", () => {
  assert.equal(formatLogDate("2026-09-12"), "2026/09/12（土）");
  assert.equal(formatLogDate("2026-01-05"), "2026/01/05（月）");
  assert.equal(formatLogDate("2026-12-31"), "2026/12/31（木）");
  assert.equal(formatLogDateShort("2026-09-20"), "9/20（日）");
  assert.equal(formatLogDateShort("2026-01-05"), "1/5（月）");
  assert.equal(formatDateTime("2026-09-12T21:30"), "2026/09/12（土） 21:30");
  assert.equal(formatDateTime("2026-09-12"), "2026/09/12（土）");
  assert.equal(timeOf("2026-09-20T21:30"), "21:30");
  assert.equal(timeOf("2026-09-20T21:30:15"), "21:30");
  assert.equal(timeOf("2026-09-20"), "");
});

test("date.isoDateTimeIn: 境界より前の時刻は論理日付の翌暦日に置く", () => {
  assert.equal(isoDateTimeIn("2026-09-20", "01:30"), "2026-09-21T01:30");
  assert.equal(isoDateTimeIn("2026-09-20", "03:59"), "2026-09-21T03:59");
  assert.equal(isoDateTimeIn("2026-09-20", "04:00"), "2026-09-20T04:00");
  assert.equal(isoDateTimeIn("2026-09-20", "21:30"), "2026-09-20T21:30");
  assert.equal(isoDateTimeIn("2026-09-30", "02:00"), "2026-10-01T02:00");
  assert.equal(isoDateTimeIn("2026-09-20", "05:59", 6), "2026-09-21T05:59");
  assert.equal(isoDateTimeIn("2026-09-20", "06:00", 6), "2026-09-20T06:00");
  // 秒は落とす
  assert.equal(isoDateTimeIn("2026-09-20", "08:30:45"), "2026-09-20T08:30");
});

test("date.isoDateTimeIn: 空の時刻は時刻なしの日時になる（だから保存の入口で hasTime で弾く）", () => {
  assert.equal(isoDateTimeIn("2026-09-20", ""), "2026-09-21T");
  assert.equal(isoDateTimeIn("2026-09-20", "ab:cd"), "2026-09-20Tab:cd");
});

test("date.hasTime: HH:mm で始まる文字列だけが時刻", () => {
  for (const value of ["08:30", "12:00:00", "99:99"]) {
    assert.equal(hasTime(value), true, value);
  }
  for (const value of ["8:30", "", "--:--"]) {
    assert.equal(hasTime(value), false, value);
  }
});

test("date.pad2: 1 桁は 0 埋めで 2 桁、2 桁以上はそのまま", () => {
  assert.equal(pad2(0), "00");
  assert.equal(pad2(5), "05");
  assert.equal(pad2(10), "10");
  assert.equal(pad2(31), "31");
  assert.equal(pad2(123), "123");
});

test("date.nowIso: 今この時刻を 'YYYY-MM-DDTHH:mm' にする（toIsoDateTime(new Date()) と同じ）", () => {
  freezeTime(new Date(2026, 9, 11, 3, 4));
  assert.equal(nowIso(), "2026-10-11T03:04");
  assert.equal(nowIso(), toIsoDateTime(new Date()));
  freezeTime(new Date(2026, 0, 2, 23, 59));
  assert.equal(nowIso(), "2026-01-02T23:59");
});

test("date.weekdayOf / formatSlashDate / compactDate: 曜日 1 文字・YYYY/MM/DD・YYYYMMDD", () => {
  assert.equal(weekdayOf("2026-09-12"), "土");
  assert.equal(weekdayOf("2026-09-20"), "日");
  assert.equal(weekdayOf("2026-09-21"), "月");
  assert.equal(formatSlashDate("2026-09-12"), "2026/09/12");
  assert.equal(formatSlashDate("2026-01-05"), "2026/01/05");
  assert.equal(compactDate("2026-09-07"), "20260907");
  assert.equal(compactDate("2026-12-31"), "20261231");
  // formatLogDate は 日付 + 曜日 をこの 2 つから組み立てる
  assert.equal(
    formatLogDate("2026-09-12"),
    `${formatSlashDate("2026-09-12")}（${weekdayOf("2026-09-12")}）`,
  );
});
