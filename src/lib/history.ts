/**
 * 種目の推移グラフに描く値（純関数）。
 *
 *  - 重量種目は「進捗を追う重量」（ダンベルは片手、それ以外は総重量）
 *  - 時間種目は各回の最長秒数、限界までの種目は各回の最多回数
 * 記録が無い回（回数も秒数も重量も無い）は描かない。
 *
 * ★ ここは純関数だけ。DB も React も触らない。★ 履歴の読み出しは lib/training.ts の loadHistory。
 */
import type { ExerciseKind } from "../db/types";
import { formatLogDateShort } from "./date";
import type { HistoryPoint } from "./training";
import { describeLoadShort, trackedWeightKg } from "./weight";

export interface ChartDatum {
  label: string;
  value: number;
  outcome: HistoryPoint["outcome"];
  detail: string;
}

/** 単位とグラフの題。重量は kg、時間種目は秒、限界までの種目は回 */
export function metricOf(kind: ExerciseKind): { unit: string; title: string } {
  if (kind === "timed")
    return { unit: "秒", title: "秒数の推移（各回の最長）" };
  if (kind === "amrap")
    return { unit: "回", title: "回数の推移（各回の最多）" };
  return { unit: "kg", title: "重量の推移" };
}

/** その回の「進捗を追う値」。記録が無ければ null */
export function chartValueOf(
  point: HistoryPoint,
  kind: ExerciseKind,
): number | null {
  if (kind === "timed") {
    const values = point.sets
      .map((set) => set.seconds)
      .filter((v): v is number => v !== null);
    return values.length === 0 ? null : Math.max(...values);
  }
  if (kind === "amrap") {
    const values = point.sets
      .map((set) => set.reps)
      .filter((v): v is number => v !== null);
    return values.length === 0 ? null : Math.max(...values);
  }
  return trackedWeightKg(point.load);
}

/** グラフの点。値の無い回は飛ばす。並びは履歴のまま（古い順） */
export function chartData(
  points: HistoryPoint[],
  kind: ExerciseKind,
): ChartDatum[] {
  const data: ChartDatum[] = [];
  for (const point of points) {
    const value = chartValueOf(point, kind);
    if (value === null) continue;
    data.push({
      label: formatLogDateShort(point.logDate),
      value,
      outcome: point.outcome,
      detail: describeLoadShort(point.load),
    });
  }
  return data;
}
