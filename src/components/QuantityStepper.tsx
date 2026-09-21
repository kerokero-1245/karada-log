/**
 * 数量の入力。既定は1。「−」「＋」で±1、直接入力もできる（小数可・最小0.1）。
 * 例: マカダミアは1単位10gなので、30g食べたら数量3。
 */
import { useState } from 'react';
import { formatQuantity } from '../lib/meals';

const MIN = 0.1;

export function QuantityStepper({
  value,
  unitLabel,
  onChange,
}: {
  value: number;
  unitLabel: string;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(() => formatQuantity(value));

  const commit = (next: string) => {
    setText(next);
    const parsed = Number(next);
    if (next.trim() !== '' && Number.isFinite(parsed) && parsed >= MIN) {
      onChange(round2(parsed));
    }
  };

  const step = (delta: number) => {
    const next = Math.max(MIN, round2(value + delta));
    setText(formatQuantity(next));
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="1減らす"
          onClick={() => step(-1)}
          className="h-14 w-14 shrink-0 rounded-full border border-slate-300 bg-white text-2xl font-bold text-slate-700 active:bg-slate-100"
        >
          −
        </button>
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setText(formatQuantity(value))}
          aria-label="数量"
          className="h-14 w-full min-w-0 rounded-lg border border-slate-300 bg-white text-center text-2xl font-bold tabular-nums"
        />
        <button
          type="button"
          aria-label="1増やす"
          onClick={() => step(1)}
          className="h-14 w-14 shrink-0 rounded-full border border-slate-300 bg-white text-2xl font-bold text-slate-700 active:bg-slate-100"
        >
          ＋
        </button>
      </div>
      <p className="mt-1 text-center text-xs text-slate-500">単位: {unitLabel}（0.1 から。小数も入ります）</p>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
