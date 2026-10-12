/**
 * kcal の表示。
 *
 * ★ 表示専用。★ 保存する値と計算（lib/nutrition.ts）は小数のまま変えない。
 *
 *  - fmtKcal:     合計・計画の合計など。整数に丸めて桁区切り（1234.5 → '1,235'）。
 *                 目標値（DayHeader / 進捗バー）と同じ「2,000」の書き方にそろえる
 *  - fmtKcalItem: 1品ごとの行・「保存する値」。小数第1位まで（118.5 → '118.5'、130 → '130'）。
 *                 行を整数に丸めると、行の和（119 + 119）と合計（237）が食い違って見えるため
 *
 * どちらも null は '—'、負のゼロ（入力欄の '-0' など）は '0' と出す。
 */
import { UNKNOWN_MARK } from "./format";
import { roundTo } from "./number";

const TOTAL = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });
const ITEM = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });

function format(
  value: number | null,
  formatter: Intl.NumberFormat,
  digits: number,
): string {
  if (value === null || Number.isNaN(value)) return UNKNOWN_MARK;
  // roundTo は負のゼロを 0 にする（Intl に -0 を渡すと '-0' と出るため）
  return formatter.format(roundTo(value, digits));
}

export function fmtKcal(value: number | null): string {
  return format(value, TOTAL, 0);
}

export function fmtKcalItem(value: number | null): string {
  return format(value, ITEM, 1);
}
