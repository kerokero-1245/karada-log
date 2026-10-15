/**
 * ボトムナビ。ルーターは使わず state で切り替える。
 * まだ使えないタブ（soon）も隠さずに残し、「準備中」の小さな印を付ける（読み上げにも含める）。
 */
export type TabKey = "today" | "training" | "body" | "week" | "settings";

const TABS: { key: TabKey; label: string; soon?: boolean }[] = [
  { key: "today", label: "今日" },
  { key: "training", label: "トレ" },
  { key: "body", label: "からだ" },
  { key: "week", label: "週", soon: true },
  { key: "settings", label: "設定" },
];

export function BottomNav({
  tab,
  onChange,
}: {
  tab: TabKey;
  onChange: (tab: TabKey) => void;
}) {
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
                aria-current={active ? "page" : undefined}
                aria-label={item.soon ? `${item.label}（準備中）` : undefined}
                className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-xs font-bold ${
                  active ? "text-emerald-700" : "text-slate-400"
                }`}
              >
                <span
                  className={`h-1 w-6 rounded-full ${active ? "bg-emerald-600" : "bg-transparent"}`}
                />
                {item.label}
                {/* 印の無いタブにも同じ高さの空きを置き、5 つのタブの文字の高さをそろえる */}
                <span
                  aria-hidden="true"
                  className={`rounded px-1 py-px text-[10px] font-medium leading-none ${
                    item.soon ? "bg-slate-100 text-slate-500" : "invisible"
                  }`}
                >
                  {item.soon ? "準備中" : "\u00a0"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
