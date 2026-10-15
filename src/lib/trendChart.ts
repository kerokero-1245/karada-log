/**
 * 推移グラフ（components/TrendChart.tsx）に渡す形と、縦の範囲の決め方（純関数）。
 * トレの重量の推移（screens/training/HistoryChart.tsx）と体組成の推移（screens/body）が同じものを使う。
 *
 * ★ ここは純関数だけ。DB も React も触らない。★
 */

/** グラフの点 1 つ。並びは古い順 */
export interface TrendPoint {
  /** 横軸の文字（'9/15（火）'） */
  label: string;
  value: number;
  /** 塗りつぶしの点か、白抜きの点か（意味は呼ぶ側が凡例で書く） */
  filled: boolean;
  /** 数値の一覧と点の説明に添える補足（重量の内訳・測定時刻など） */
  detail: string;
  /** 数値の一覧の右端に出す状態（「達成」「⚠ 条件が悪い」など。無ければ空） */
  status: string;
}

/** 点に重ねる水平の基準線（体組成の目標ラインなど） */
export interface TrendReference {
  value: number;
  label: string;
}

/**
 * 縦の範囲。点が 1 つでも崩れないように、幅が 0 なら上下に 1 ずつ、それ以外は幅の 15% を足す。
 * extra（基準線の値）も範囲に含める。点から離れていても線が枠の外に出ないように。
 * minSpan（任意）を渡すと、範囲がそれより狭いときは中央を保ったまま minSpan まで広げる
 * （体組成の 0.1kg の差が描画域いっぱいの急落に見えないように）。渡さなければ広げない（トレの推移）。
 */
export function trendRange(
  values: number[],
  extra: number[] = [],
  options: { minSpan?: number } = {},
): { lo: number; hi: number } {
  const all = [...values, ...extra];
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  } else {
    const pad = (hi - lo) * 0.15;
    lo -= pad;
    hi += pad;
  }
  const minSpan = options.minSpan ?? 0;
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  return { lo, hi };
}
