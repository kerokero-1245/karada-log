/**
 * フルスクリーンのシート。記録画面はすべてこの上に載せる。
 * 片手操作前提で、左上に「戻る／閉じる」、下部に主ボタンを固定する。
 * 幅はメイン画面と同じ max-w-md。広い画面では中央に置き、左右は下の画面を暗くして覆う
 * （覆いは操作を受け止めるだけで、押しても閉じない）。
 * 開いている間は後ろの画面をスクロールさせない（覆いの上のホイール・スワイプで下が動かないように）。
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';

/** 開いているシートの数。シートを差し替えるときに、閉じた側が固定を外してしまわないように数える */
let openSheets = 0;
let savedOverflow = '';

function useLockBodyScroll() {
  useEffect(() => {
    const { body } = document;
    if (openSheets === 0) {
      savedOverflow = body.style.overflow;
      body.style.overflow = 'hidden';
    }
    openSheets += 1;
    return () => {
      openSheets -= 1;
      if (openSheets === 0) body.style.overflow = savedOverflow;
    };
  }, []);
}

export function Sheet({
  title,
  subtitle,
  onClose,
  onBack,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useLockBodyScroll();
  return (
    <>
      <div aria-hidden className="fixed inset-x-0 inset-y-0 z-50 touch-none overscroll-none bg-slate-900/40" />
      <div className="fixed inset-0 z-50 mx-auto flex w-full max-w-md flex-col bg-slate-50 shadow-xl">
        <header className="flex items-center gap-1 border-b border-slate-200 bg-white px-1 pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={onBack ?? onClose}
            className="min-h-12 min-w-16 rounded-lg px-2 text-sm text-slate-600 active:bg-slate-100"
          >
            {onBack ? '← 戻る' : '閉じる'}
          </button>
          <div className="flex-1 py-2 text-center">
            <h2 className="text-base font-bold text-balance text-slate-800">{title}</h2>
            {/* 折り返すときは行の長さをそろえる（1文字だけ次の行に落ちないように） */}
            {subtitle && <p className="text-[11px] text-balance text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className={`min-h-12 min-w-16 rounded-lg px-2 text-sm text-slate-600 active:bg-slate-100 ${
              onBack ? '' : 'invisible'
            }`}
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain p-3">{children}</div>

        {footer && (
          <div className="border-t border-slate-200 bg-white p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
