/**
 * 画面の上のヘッダー（濃い背景・白い文字）。タブの画面（今日・からだ・設定・準備中の画面）で同じ形を使う。
 * 中身は幅をそろえた枠（max-w-md）の中に置く。row は見出しと印を横に並べるとき。
 * トレーニング画面は上に貼りつく別の形（余白も違う）なので、これは使わない。
 */
import type { ReactNode } from "react";

export function ScreenHeader({
  children,
  row = false,
}: {
  children: ReactNode;
  row?: boolean;
}) {
  return (
    <header className="bg-slate-900 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] text-white">
      <div
        className={
          row ? "mx-auto flex max-w-md items-center gap-2" : "mx-auto max-w-md"
        }
      >
        {children}
      </div>
    </header>
  );
}
