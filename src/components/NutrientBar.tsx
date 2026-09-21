/**
 * 進捗バー1本。
 * 「現在 / 目標」と「あと ○」を必ず数値で出す。
 * P は目標(140g)と上限(152g)の2本のマーカーを引き、上限より上はグレーにする。
 */
import type { BarModel } from '../lib/goals';
import { toneTextClass } from '../lib/goals';

export function NutrientBar({ bar }: { bar: BarModel }) {
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-slate-700">{bar.label}</span>
        <span className="text-sm tabular-nums text-slate-800">{bar.valueText}</span>
      </div>

      <div className="relative mt-1 h-3.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="flex h-full w-full">
          {bar.segments.map((segment, i) => (
            <div key={i} className={segment.className} style={{ width: `${segment.widthPercent}%` }} />
          ))}
        </div>
        {bar.markers.map((marker, i) => (
          <div
            key={i}
            aria-hidden
            className="absolute top-0 h-full w-0.5 -translate-x-full bg-slate-700/70"
            style={{ left: `${marker.percent}%` }}
          />
        ))}
      </div>

      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="text-[11px] text-slate-500">{bar.legendText}</span>
        <span className={`text-sm font-bold tabular-nums ${toneTextClass(bar.tone)}`}>{bar.remainText}</span>
      </div>

      {bar.noteText && <p className="mt-0.5 text-[11px] text-slate-500">{bar.noteText}</p>}

      {bar.unknownCount > 0 && (
        <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          未確認の項目あり（{bar.unknownCount}件）
        </span>
      )}
    </div>
  );
}
