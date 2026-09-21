/**
 * フルスクリーンのシート。記録画面はすべてこの上に載せる。
 * 片手操作前提で、左上に「戻る／閉じる」、下部に主ボタンを固定する。
 */
import type { ReactNode } from 'react';

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
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50">
      <header className="flex items-center gap-1 border-b border-slate-200 bg-white px-1 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={onBack ?? onClose}
          className="min-h-12 min-w-16 rounded-lg px-2 text-sm text-slate-600 active:bg-slate-100"
        >
          {onBack ? '← 戻る' : '閉じる'}
        </button>
        <div className="flex-1 py-2 text-center">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
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
  );
}
