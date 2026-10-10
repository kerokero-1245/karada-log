/**
 * 書き出す期間の決め方（lib/exportRange.ts）の今の出力を固定する特性テスト。
 *
 * 「今日」は引数で渡す純関数。期間はすべて論理日付で持ち、週の起点は月曜。
 * 2026-09-21 は月曜（2026-09-27 が日曜）。値は架空のサンプル。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RANGE_PRESET,
  RANGE_PRESETS,
  formatRange,
  inRange,
  rangeDates,
  rangeDayCount,
  rangeFileStamp,
  resolveRange,
} from "../src/lib/exportRange.ts";
import type { DateRange, RangePresetKey } from "../src/lib/exportRange.ts";

const custom: DateRange = { start: "2026-09-01", end: "2026-09-05" };

test("exportRange: 既定の期間は直近 7 日、選べる期間は 5 つ（表示名つき）", () => {
  assert.equal(DEFAULT_RANGE_PRESET, "last7");
  assert.deepEqual(RANGE_PRESETS, [
    { key: "thisWeek", label: "今週" },
    { key: "lastWeek", label: "先週" },
    { key: "last7", label: "直近7日" },
    { key: "last14", label: "直近14日" },
    { key: "custom", label: "日付指定" },
  ]);
});

test("exportRange.resolveRange: 今日が水曜（2026-09-23）のときの全プリセット", () => {
  const expectations: [RangePresetKey, DateRange][] = [
    // 今週は「週の起点 〜 今日」。まだ来ていない日は並べない
    ["thisWeek", { start: "2026-09-21", end: "2026-09-23" }],
    ["lastWeek", { start: "2026-09-14", end: "2026-09-20" }],
    ["last7", { start: "2026-09-17", end: "2026-09-23" }],
    ["last14", { start: "2026-09-10", end: "2026-09-23" }],
    ["custom", { start: "2026-09-01", end: "2026-09-05" }],
  ];
  for (const [key, expected] of expectations) {
    assert.deepEqual(resolveRange(key, "2026-09-23", custom), expected, key);
  }
});

test("exportRange.resolveRange: 週の境目（月曜・日曜・翌月曜）", () => {
  const range = (today: string, key: RangePresetKey) =>
    resolveRange(key, today, custom);
  // 月曜: 今週は今日だけ、先週は前の月曜〜日曜
  assert.deepEqual(range("2026-09-21", "thisWeek"), {
    start: "2026-09-21",
    end: "2026-09-21",
  });
  assert.deepEqual(range("2026-09-21", "lastWeek"), {
    start: "2026-09-14",
    end: "2026-09-20",
  });
  // 日曜: 今週は月曜から今日まで 7 日分
  assert.deepEqual(range("2026-09-27", "thisWeek"), {
    start: "2026-09-21",
    end: "2026-09-27",
  });
  assert.deepEqual(range("2026-09-27", "last7"), {
    start: "2026-09-21",
    end: "2026-09-27",
  });
  // 翌月曜: 先週は昨日までの 7 日分
  assert.deepEqual(range("2026-09-28", "lastWeek"), {
    start: "2026-09-21",
    end: "2026-09-27",
  });
  assert.deepEqual(range("2026-09-28", "last14"), {
    start: "2026-09-15",
    end: "2026-09-28",
  });
});

test("exportRange.resolveRange: 週の起点は引数で変えられる（日曜起点）", () => {
  assert.deepEqual(resolveRange("thisWeek", "2026-09-23", custom, 0), {
    start: "2026-09-20",
    end: "2026-09-23",
  });
  assert.deepEqual(resolveRange("lastWeek", "2026-09-23", custom, 0), {
    start: "2026-09-13",
    end: "2026-09-19",
  });
});

test("exportRange.resolveRange: 日付指定は逆順でも入れ替える。読めない日付は今日に寄せる", () => {
  const resolve = (value: DateRange) =>
    resolveRange("custom", "2026-09-23", value);
  assert.deepEqual(resolve({ start: "2026-09-05", end: "2026-09-01" }), {
    start: "2026-09-01",
    end: "2026-09-05",
  });
  assert.deepEqual(resolve({ start: "2026-09-10", end: "2026-09-10" }), {
    start: "2026-09-10",
    end: "2026-09-10",
  });
  // 片方が空・形式違いなら、その側だけ今日にする
  assert.deepEqual(resolve({ start: "", end: "2026-09-01" }), {
    start: "2026-09-01",
    end: "2026-09-23",
  });
  assert.deepEqual(resolve({ start: "2026-09-01", end: "9/1" }), {
    start: "2026-09-01",
    end: "2026-09-23",
  });
  assert.deepEqual(resolve({ start: "x", end: "" }), {
    start: "2026-09-23",
    end: "2026-09-23",
  });
  // 今日に寄せたあとで開始が終了より後なら入れ替える
  assert.deepEqual(resolve({ start: "2026-9-1", end: "2026-09-30" }), {
    start: "2026-09-23",
    end: "2026-09-30",
  });
  // 形式（YYYY-MM-DD）だけを見る。暦に無い日付でもそのまま通す（今の出力）
  assert.deepEqual(resolve({ start: "2026-02-30", end: "2026-13-45" }), {
    start: "2026-02-30",
    end: "2026-13-45",
  });
});

test("exportRange.rangeDates / rangeDayCount: 両端を含めて古い順。逆順の期間は開始の 1 日だけ", () => {
  assert.deepEqual(rangeDates({ start: "2026-09-29", end: "2026-10-02" }), [
    "2026-09-29",
    "2026-09-30",
    "2026-10-01",
    "2026-10-02",
  ]);
  assert.deepEqual(rangeDates({ start: "2026-09-29", end: "2026-09-29" }), [
    "2026-09-29",
  ]);
  assert.deepEqual(rangeDates({ start: "2026-10-02", end: "2026-09-29" }), [
    "2026-10-02",
  ]);
  assert.equal(rangeDayCount({ start: "2026-09-29", end: "2026-10-02" }), 4);
  assert.equal(rangeDayCount({ start: "2026-09-29", end: "2026-09-29" }), 1);
  assert.equal(rangeDayCount({ start: "2026-10-02", end: "2026-09-29" }), 1);
});

test("exportRange.inRange: 両端を含む", () => {
  const range: DateRange = { start: "2026-09-21", end: "2026-09-23" };
  assert.deepEqual(
    ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"].map(
      (logDate) => inRange(range, logDate),
    ),
    [false, true, true, true, false],
  );
});

test("exportRange.formatRange / rangeFileStamp: 見出しの書き方とファイル名の日付", () => {
  const range: DateRange = { start: "2026-09-07", end: "2026-09-22" };
  assert.equal(formatRange(range), "2026/09/07〜2026/09/22");
  // Markdown のファイル名は karada-log-<この値>.md（画面 ExportCard が組み立てる）
  assert.equal(rangeFileStamp(range), "20260907-20260922");
});
