/** まだ作っていないタブ。何が来るのかを一行だけ書いておく。 */
import { Card } from '../components/ui';

export function PlaceholderScreen({ title, plan }: { title: string; plan: string }) {
  return (
    <div className="min-h-screen bg-slate-100 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="bg-slate-900 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] text-white">
        <div className="mx-auto max-w-md">
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-md p-3">
        <Card>
          <p className="text-sm font-medium text-slate-700">次のステップで追加します。</p>
          <p className="mt-1 text-xs text-slate-500">{plan}</p>
        </Card>
      </main>
    </div>
  );
}
