/**
 * 種目の直近の推移グラフ。描画は共通の TrendChart（components/TrendChart.tsx）に任せる。
 *  - 重量種目は「進捗を追う重量」（ダンベルは片手、それ以外は総重量）
 *  - 時間種目は各回の最長秒数、限界までの種目は各回の最多回数
 * 規定に届いた回は塗りつぶし、据え置きの回は白抜き。
 */
import type { ExerciseKind } from "../../db/types";
import { OUTCOME_LABELS } from "../../db/types";
import { TrendChart } from "../../components/TrendChart";
import { chartData, metricOf } from "../../lib/history";
import type { HistoryPoint } from "../../lib/training";

export function HistoryChart({
  points,
  kind,
}: {
  points: HistoryPoint[];
  kind: ExerciseKind;
}) {
  const { unit, title } = metricOf(kind);
  const data = chartData(points, kind);

  if (data.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        まだ推移を描ける記録がありません。記録するとここにグラフが出ます。
      </p>
    );
  }

  return (
    <TrendChart
      title={title}
      legend="● 規定に到達 ○ 据え置き"
      unit={unit}
      points={data.map((d) => ({
        label: d.label,
        value: d.value,
        filled: d.outcome === "achieved",
        detail: d.detail,
        status: OUTCOME_LABELS[d.outcome],
      }))}
      testId="history-chart"
    />
  );
}
