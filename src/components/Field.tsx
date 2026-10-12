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
