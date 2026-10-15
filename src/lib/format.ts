/**
 * 表示の整形のうち、kcal 専用ではないもの。
 *
 * ★ 表示専用。★ 保存する値と計算（lib/nutrition.ts）は小数のまま変えない。
 */

/**
 * 未確認（null）の印。栄養値の未入力は 0 で埋めず、分からないものは分からないと出す。
 * 画面にも書き出しにも、この 1 つを使う。
 */
export const UNKNOWN_MARK = "—";

/**
 * 開始時刻が未記録で仮置きのトレ（TrainingSession.startedAtIsEstimated）に添える注記。
 * 書き出しのトレの見出しと、体組成の「最後のトレから」の日数で同じ文字を使う。
 */
export const ESTIMATED_START_NOTE = "（開始時刻は仮置き）";

const STORED = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 20 });

/**
 * 開発用のデータ確認・設定画面向け。保存されている値を丸めずに出す（桁区切りだけ付ける）。
 * null は '—'、負のゼロは '0'。
 */
export function fmtStored(value: number | null): string {
  if (value === null || Number.isNaN(value)) return UNKNOWN_MARK;
  return STORED.format(value === 0 ? 0 : value);
}
