/**
 * 記録シートの入力方法の切替。
 * 既定は「テキスト」。店頭で1品ずつ探すより、食べたものを書き出すほうが速い。
 * 1品だけ・栄養値を見ながら数量を決めたいときは「検索」に切り替える。
 */
export type MealAddMode = 'text' | 'search';

const LABELS: Record<MealAddMode, string> = {
  text: 'テキスト',
  search: '検索',
};

export function ModeTabs({ mode, onChange }: { mode: MealAddMode; onChange: (mode: MealAddMode) => void }) {
  return (
    <div className="flex gap-1 rounded-xl bg-slate-200 p-1">
      {(['text', 'search'] as MealAddMode[]).map((key) => {
        const active = key === mode;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={`min-h-11 flex-1 rounded-lg text-sm font-bold ${
              active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            {LABELS[key]}
          </button>
        );
      })}
    </div>
  );
}
