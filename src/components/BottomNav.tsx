/** ボトムナビ。ルーターは使わず state で切り替える。 */
export type TabKey = 'today' | 'training' | 'body' | 'week' | 'settings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: 'training', label: 'トレ' },
  { key: 'body', label: 'からだ' },
  { key: 'week', label: '週' },
  { key: 'settings', label: '設定' },
];

export function BottomNav({ tab, onChange }: { tab: TabKey; onChange: (tab: TabKey) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((item) => {
          const active = item.key === tab;
          return (
            <li key={item.key} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(item.key)}
                aria-current={active ? 'page' : undefined}
                className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-xs font-bold ${
                  active ? 'text-emerald-700' : 'text-slate-400'
                }`}
              >
                <span className={`h-1 w-6 rounded-full ${active ? 'bg-emerald-600' : 'bg-transparent'}`} />
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
