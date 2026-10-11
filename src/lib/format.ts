/**
 * 表示の整形のうち、kcal 専用ではないもの。
 *
 * ★ 表示専用。★ 保存する値と計算（lib/nutrition.ts）は小数のまま変えない。
 */
const STORED = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 20 });

/**
 * 開発用のデータ確認・設定画面向け。保存されている値を丸めずに出す（桁区切りだけ付ける）。
 * null は '—'、負のゼロは '0'。
 */
export function fmtStored(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return STORED.format(value === 0 ? 0 : value);
}
