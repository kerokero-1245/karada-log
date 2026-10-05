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
const TOTAL = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });
const ITEM = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });

function format(value: number | null, formatter: Intl.NumberFormat, digits: number): string {
  if (value === null || Number.isNaN(value)) return '—';
  const scale = 10 ** digits;
  const rounded = Math.round(value * scale) / scale;
  // Math.round(-0.04) や入力の '-0' は -0 になり、Intl は '-0' と出す
  return formatter.format(rounded === 0 ? 0 : rounded);
}

export function fmtKcal(value: number | null): string {
  return format(value, TOTAL, 0);
}

export function fmtKcalItem(value: number | null): string {
  return format(value, ITEM, 1);
}

const STORED = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 20 });

/**
 * 開発用のデータ確認画面向け。保存されている値を丸めずに出す（桁区切りだけ付ける）。
 * null は '—'、負のゼロは '0'。
 */
export function fmtStored(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return STORED.format(value === 0 ? 0 : value);
}
