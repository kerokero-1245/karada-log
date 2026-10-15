/**
 * 推移の線グラフ（依存を足さず SVG を自前で描く）。トレの重量の推移と体組成の推移が同じものを使う。
 * 点が1つでも崩れない（値の幅が 0 のときは上下に余白を取って中央に置く。lib/trendChart.ts の trendRange）。
 * 点は塗りつぶしと白抜きの 2 種類（意味は legend で書く）。色だけに頼らず数値の一覧も出す。
 * reference（目標ラインなど）を渡すと、破線の水平線を重ね、その説明は図の上（題の下）に文字で出す
 * （線の上に文字を置くと、点や線と重なって読めなくなるため）。
 * padRight は最新の値の文字（「55.9kg」など）の置き場の幅。桁の多い値を出すときに広げる。
 * minSpan は縦の範囲の最小幅（trendRange の minSpan）。渡さなければ広げない。
 * 縦軸の数字（最大・最小）は点の左端より左に置き、2 つの間隔が文字の高さより狭いときは最大だけ出す。
 * 点が 0 個のときの表示は呼ぶ側で出す（ここは 1 個以上の点を描く）。
 */
import { formatFixed, formatNumber } from "../lib/number";
import { trendRange } from "../lib/trendChart";
import type { TrendPoint, TrendReference } from "../lib/trendChart";

/** 色は Tailwind の emerald-600（線・点）・slate-500（軸の文字・基準線）・slate-200（目盛りの線）・slate-900（最新の値）・white（白抜きの点）と同じ */
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
/** 縦軸の数字の大きさ（px）。最大・最小の数字の間隔がこれより狭いと重なる */
const AXIS_FONT = 10;
/** 縦軸の数字の右端と描画域の左端の間（点の半径 4.5 と線の太さの半分 1 より広く） */
const AXIS_GAP = 8;

export function TrendChart({
  title,
  legend,
  unit,
  points: data,
  reference,
  testId,
  padRight = PAD.right,
  minSpan,
}: {
  title: string;
  /** 点の 2 種類の凡例（「● 規定に到達 ○ 据え置き」など） */
  legend: string;
  unit: string;
  points: TrendPoint[];
  reference?: TrendReference;
  testId: string;
  padRight?: number;
  minSpan?: number;
}) {
  const values = data.map((d) => d.value);
  const { lo, hi } = trendRange(
    values,
    reference === undefined ? [] : [reference.value],
    { minSpan },
  );
  const plotW = W - PAD.left - padRight;
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
  // 最大と最小の数字が重なるほど近ければ、最小の数字は出さない（線は残す）
  const showMinLabel = Math.abs(y(minV) - y(maxV)) >= AXIS_FONT;
  const ariaPoints = data
    .map((d) => `${d.label} ${formatNumber(d.value)}${unit}`)
    .join("、");

  return (
    <figure className="space-y-1" data-testid={testId}>
      <figcaption className="flex items-baseline justify-between gap-2 text-xs text-slate-600">
        <span className="font-bold">{title}</span>
        <span className="text-[11px] text-slate-500">{legend}</span>
      </figcaption>
      {reference !== undefined && (
        <p className="text-[11px] text-slate-500">破線: {reference.label}</p>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={
          reference === undefined
            ? `${title}。${ariaPoints}`
            : `${title}。${ariaPoints}。${reference.label}`
        }
      >
        {/* 目盛り（最大・最小）。控えめな線で */}
        {[maxV, minV].map((v, i) =>
          i === 1 && maxV === minV ? null : (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={W - padRight}
                y1={y(v)}
                y2={y(v)}
                stroke={COLORS.grid}
                strokeWidth={1}
              />
              {(i === 0 || showMinLabel) && (
                <text
                  x={PAD.left - AXIS_GAP}
                  y={y(v) + 3}
                  textAnchor="end"
                  fontSize={AXIS_FONT}
                  fill={COLORS.axisText}
                >
                  {formatNumber(v)}
                </text>
              )}
            </g>
          ),
        )}
        {reference !== undefined && (
          <g data-testid={`${testId}-reference`}>
            <line
              x1={PAD.left}
              x2={W - padRight}
              y1={y(reference.value)}
              y2={y(reference.value)}
              stroke={COLORS.axisText}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          </g>
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
              <title>{`${d.label} ${formatNumber(d.value)}${unit}（${d.detail}）${d.status}`}</title>
            </circle>
            <circle
              cx={x(i)}
              cy={y(d.value)}
              r={4.5}
              fill={d.filled ? COLORS.line : COLORS.hollow}
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
                <td className="py-0.5 pl-2 text-right">{d.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
