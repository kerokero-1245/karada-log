/**
 * 数値の丸めと、数値の文字列化。桁の規則はこのファイルが正（DESIGN.md「数値の整形と丸め」）。
 *
 * ★ ここは純関数だけ。DB も React も触らない。★
 *
 * 丸めは Math.round 系の 1 つだけ。toFixed は使わない（2.675 は 2 進数では 2.67499… なので
 * toFixed で 2 桁にすると '2.67' になり、Math.round(2.675 * 100) の 268 → '2.68' と食い違うため）。
 * 負のゼロ（-0）は 0 にする（'-0' と出さない。Intl に '-0' を渡さない）。
 */

/** 小数第 digits 位で丸める（Math.round 系）。-0 は 0 */
export function roundTo(n: number, digits: number): number {
  const scale = 10 ** digits;
  const rounded = Math.round(n * scale) / scale;
  return rounded === 0 ? 0 : rounded;
}

/** 小数第 2 位で丸める。栄養値の掛け算・足し算、重量、数量 */
export function round2(n: number): number {
  return roundTo(n, 2);
}

/** 小数第 3 位で丸める。1 単位あたりの栄養値（合計を数量で割る） */
export function round3(n: number): number {
  return roundTo(n, 3);
}

/** a + b を小数第 2 位で丸める。重量の加算（次回の重量・プレートの足し算） */
export function addRounded(a: number, b: number): number {
  return round2(a + b);
}

/**
 * 丸めた値をそのまま文字列にする。末尾の 0 は付かない（140 → '140'、1.50 → '1.5'）。
 * 既定は小数第 2 位。g の栄養素・kg・数量・回数の表示は、行も合計も進捗バーも書き出しもこれ。
 */
export function formatNumber(n: number, digits = 2): string {
  return String(roundTo(n, digits));
}

/**
 * 小数第 digits 位ちょうどで文字列にする（末尾の 0 を残す: 2 → '2.0'）。
 * 符号つきの差（+2.0kg）やグラフの座標のように、桁をそろえたい所だけで使う。
 */
export function formatFixed(n: number, digits: number): string {
  const text = String(roundTo(n, digits));
  const dot = text.indexOf(".");
  if (dot < 0) return digits > 0 ? `${text}.${"0".repeat(digits)}` : text;
  return text.padEnd(dot + 1 + digits, "0");
}
