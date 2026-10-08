/**
 * まだ使えないタブ（からだ・週）。
 * タブは隠さずに残し、開いた人が「準備中」だと分かるように見出しと短い説明を出す。
 * 文言は利用者向けにする（開発の段取りや機能番号は書かない）。
 */
import { Card } from '../components/ui';

export function PlaceholderScreen({ title, plan }: { title: string; plan: string }) {
  return (
    <div className="min-h-screen bg-slate-100 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="bg-slate-900 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] text-white">
        <div className="mx-auto flex max-w-md items-center gap-2">
          <h1 className="text-xl font-bold">{title}</h1>
          <span className="rounded bg-amber-300 px-1.5 py-0.5 text-[11px] font-bold text-amber-950">準備中</span>
        </div>
      </header>
      <main className="mx-auto max-w-md p-3">
        <Card>
          <h2 className="text-base font-bold text-slate-800">この画面は準備中です</h2>
          <p className="mt-1 text-sm text-slate-700">今はまだ使えません。使えるようになると、ここで次のことができます。</p>
          <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-600">{plan}</p>
          <p className="mt-2 text-xs text-slate-500">食事の記録は「今日」タブ、書き出しやバックアップは「設定」タブで使えます。</p>
        </Card>
      </main>
    </div>
  );
}
