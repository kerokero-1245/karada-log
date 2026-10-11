/**
 * 数値の入力（− / 直接入力 / ＋）。重量・回数・秒数に使う。
 * 入力途中の文字（'12.' など）を壊さないよう、表示用の文字列を別に持つ。
 */
import { useState } from "react";

function fmt(value: number | null): string {
  if (value === null) return "";
  return String(Math.round(value * 100) / 100);
}

export function NumberField({
  value,
  onChange,
  step,
  unit,
  label,
  placeholder,
  allowEmpty = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  step: number;
  unit: string;
  label: string;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState(() => fmt(value));

  // 外から値が変わったとき（「規定どおりに入れる」など）は表示を合わせる（描画中に前回値と比べる）
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    if (!(text.trim() !== "" && Number(text) === value)) setText(fmt(value));
  }

  const commit = (next: string) => {
    setText(next);
    if (next.trim() === "") {
      if (allowEmpty) onChange(null);
      return;
    }
    const parsed = Number(next);
    if (Number.isFinite(parsed) && parsed >= 0)
      onChange(Math.round(parsed * 100) / 100);
  };

  const bump = (delta: number) => {
    const base = value ?? 0;
    const next = Math.max(0, Math.round((base + delta) * 100) / 100);
    setText(fmt(next));
    onChange(next);
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`${label}を${step}減らす`}
        onClick={() => bump(-step)}
        className="h-11 w-11 shrink-0 rounded-full border border-slate-300 bg-white text-xl font-bold text-slate-700 active:bg-slate-100"
      >
        −
      </button>
      <div className="relative min-w-0 flex-1">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setText(fmt(value))}
          aria-label={label}
          className="h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white pr-8 text-center text-lg font-bold tabular-nums placeholder:font-normal placeholder:text-slate-300"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">
          {unit}
        </span>
      </div>
      <button
        type="button"
        aria-label={`${label}を${step}増やす`}
        onClick={() => bump(step)}
        className="h-11 w-11 shrink-0 rounded-full border border-slate-300 bg-white text-xl font-bold text-slate-700 active:bg-slate-100"
      >
        ＋
      </button>
    </div>
  );
}
