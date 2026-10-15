/**
 * 体組成の推移グラフ 1 枚（脂肪量か除脂肪量）。描画は共通の TrendChart に任せ、
 * ここでは体組成の決まり（目標の破線・縦の範囲の最小幅・凡例・最新の値の置き場）を渡す。
 * 中身は lib/bodyComposition.ts の bodyTrend が作る。
 */
import { TrendChart } from "../../components/TrendChart";
import type { BodyTrend } from "../../lib/bodyComposition";

export function BodyTrendChart({
  trend,
  testId,
}: {
  trend: BodyTrend;
  testId: string;
}) {
  return (
    <TrendChart
      title={trend.title}
      legend="● 印なし ○ 条件が悪い"
      unit={trend.unit}
      points={trend.points}
      reference={trend.reference}
      minSpan={trend.minSpan}
      testId={testId}
      padRight={56}
    />
  );
}
