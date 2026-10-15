/**
 * 入力欄の見出し（小さな太字）。hint は同じ行に出す薄い補足。
 * 入力欄そのものは呼ぶ側で置く（種類や大きさが画面ごとに違うため）。
 */
import type { ReactNode } from "react";

export function FieldLabel({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <span className="block text-xs font-bold text-slate-600">
      {children}
      {hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
    </span>
  );
}

/**
 * 見出しつきの入力欄の枠（label 要素で包むので、見出しを押すと欄に入る）。
 * hint は見出しの横、note は欄の下に出す補足（横に並べた欄の高さをそろえたいときは note）。
 */
export function Field({
  label,
  hint,
  note,
  children,
}: {
  label: string;
  hint?: string;
  /** 入力欄の下に出す補足 */
  note?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <span className="mt-1 block">{children}</span>
      {note && (
        <span className="mt-1 block text-[11px] text-slate-400">{note}</span>
      )}
    </label>
  );
}
