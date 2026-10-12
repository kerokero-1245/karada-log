/**
 * 直近の推移グラフ（依存を足さず SVG を自前で描く）。
 *  - 重量種目は「進捗を追う重量」（ダンベルは片手、それ以外は総重量）
 *  - 時間種目は各回の最長秒数、限界までの種目は各回の最多回数
 * 点が1つでも崩れない（値の幅が 0 のときは上下に余白を取って中央に置く）。
 * 規定に届いた回は塗りつぶし、据え置きの回は白抜き。色だけに頼らず数値の一覧も出す。
 */
import type { ExerciseKind } from "../../db/types";
import { OUTCOME_LABELS } from "../../db/types";
import { chartData, metricOf } from "../../lib/history";
import { formatFixed, formatNumber } from "../../lib/number";
import type { HistoryPoint } from "../../lib/training";

/** 色は Tailwind の emerald-600（線・点）・slate-500（軸の文字）・slate-200（目盛りの線）・slate-900（最新の値）・white（据え置きの回の白抜き）と同じ */
const COLORS = {
  line: "#059669",
  axisText: "#64748b",
  grid: "#e2e8f0",
  labelText: "#0f172a",
  hollow: "#ffffff",
};

const W = 320;
const H = 132;
const PAD = { left: 36, right: 40, top: 14, bottom: 26 };

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

  const values = data.map((d) => d.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  } else {
    const pad = (hi - lo) * 0.15;
    lo -= pad;
    hi += pad;
  }
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    data.length === 1
      ? PAD.left + plotW / 2
      : PAD.left + (plotW * i) / (data.length - 1);
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const path = data
    .map(
      (d, i) =>
        `${i === 0 ? "M" : "L"}${formatFixed(x(i), 1)},${formatFixed(y(d.value), 1)}`,
    )
    .join(" ");
  const last = data[data.length - 1];
  const maxV = Math.max(...values);
  const minV = Math.min(...values);

  return (
    <figure className="space-y-1" data-testid="history-chart">
      <figcaption className="flex items-baseline justify-between gap-2 text-xs text-slate-600">
        <span className="font-bold">{title}</span>
        <span className="text-[11px] text-slate-500">
          ● 規定に到達 ○ 据え置き
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${title}。${data.map((d) => `${d.label} ${formatNumber(d.value)}${unit}`).join("、")}`}
      >
        {/* 目盛り（最大・最小）。控えめな線で */}
        {[maxV, minV].map((v, i) =>
          i === 1 && maxV === minV ? null : (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke={COLORS.grid}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 4}
                y={y(v) + 3}
                textAnchor="end"
                fontSize={10}
                fill={COLORS.axisText}
              >
                {formatNumber(v)}
              </text>
            </g>
          ),
        )}
        {data.length > 1 && (
          <path
            d={path}
            fill="none"
            stroke={COLORS.line}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}
        {data.map((d, i) => (
          <g key={i}>
            {/* 押しやすいように見えない大きめの当たり判定を置く */}
            <circle cx={x(i)} cy={y(d.value)} r={12} fill="transparent">
              <title>{`${d.label} ${formatNumber(d.value)}${unit}（${d.detail}）${OUTCOME_LABELS[d.outcome]}`}</title>
            </circle>
            <circle
              cx={x(i)}
              cy={y(d.value)}
              r={4.5}
              fill={d.outcome === "achieved" ? COLORS.line : COLORS.hollow}
              stroke={COLORS.line}
              strokeWidth={2}
              pointerEvents="none"
            />
          </g>
        ))}
        <text
          x={x(data.length - 1) + 8}
          y={y(last.value) + 4}
          fontSize={11}
          fontWeight={700}
          fill={COLORS.labelText}
        >
          {formatNumber(last.value)}
          {unit}
        </text>
        <text
          x={x(0)}
          y={H - 6}
          textAnchor={data.length === 1 ? "middle" : "start"}
          fontSize={10}
          fill={COLORS.axisText}
        >
          {data[0].label}
        </text>
        {data.length > 1 && (
          <text
            x={x(data.length - 1)}
            y={H - 6}
            textAnchor="end"
            fontSize={10}
            fill={COLORS.axisText}
          >
            {last.label}
          </text>
        )}
      </svg>
      <details className="text-xs text-slate-600">
        <summary className="min-h-8 cursor-pointer select-none py-1">
          数値で見る（{data.length}回分）
        </summary>
        <table className="w-full tabular-nums">
          <tbody>
            {data.map((d, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-0.5">{d.label}</td>
                <td className="py-0.5 text-right">
                  {formatNumber(d.value)}
                  {unit}
                </td>
                <td className="py-0.5 pl-2">{d.detail}</td>
                <td className="py-0.5 pl-2 text-right">
                  {OUTCOME_LABELS[d.outcome]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
