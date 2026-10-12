/**
 * 画面の外枠（背景・下部ナビぶんの余白）と、ヘッダーの下の本文の幅・間隔。
 * 下に出る固定の操作や重ねて開くシートを持つ画面（今日）は、余白も並びも違うので使わない。
 * spaced は本文の直下の要素どうしに間隔を空けるか（準備中の画面は 1 枚のカードだけなので空けない）。
 */
import type { ReactNode } from "react";

export function ScreenLayout({
  header,
  spaced = true,
  children,
}: {
  header: ReactNode;
  spaced?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-100 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {header}
      <main
        className={
          spaced ? "mx-auto max-w-md space-y-3 p-3" : "mx-auto max-w-md p-3"
        }
      >
        {children}
      </main>
    </div>
  );
}
