/**
 * その日に記録した食品の一覧（時刻順）。行をタップすると編集シートが開く。
 * 推定値・固定ベース由来はバッジで区別する（数字の出どころを隠さない）。
 * テキストから入れたものは原文も出す（「何と書いたものが、何になったか」を追えるように）。
 */
import type { MealEntry } from '../../db/types';
import { timeOf } from '../../lib/date';
import { entryNutrition, formatQuantity } from '../../lib/meals';
import { fmtNum } from '../../lib/nutrition';
import { Badge } from '../../components/ui';
import { fmtKcalItem } from '../../lib/formatKcal';

export function MealList({
  entries,
  onSelect,
}: {
  entries: MealEntry[];
  onSelect: (entry: MealEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-slate-500">
        まだ記録がありません。下の「＋ 記録する」から追加できます。
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {entries.map((entry) => {
        const value = entryNutrition(entry);
        return (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onSelect(entry)}
              className="flex min-h-14 w-full items-start gap-3 py-2 text-left active:bg-slate-50"
            >
              <span className="w-12 shrink-0 pt-0.5 text-sm tabular-nums text-slate-500">
                {timeOf(entry.recordedAt)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                  <span className="text-sm font-medium text-slate-800">{entry.snapshot.name}</span>
                  {entry.snapshot.variantLabel && <Badge tone="blue">{entry.snapshot.variantLabel}</Badge>}
                  {entry.snapshot.source === 'estimated' && <Badge tone="amber">推定値</Badge>}
                  {entry.fromShortcutSetId !== null && <Badge tone="slate">固定ベース</Badge>}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {formatQuantity(entry.quantity)} × {entry.snapshot.unitLabel}
                </span>
                <span className="mt-0.5 block text-xs tabular-nums text-slate-600">
                  {fmtKcalItem(value.kcal)}kcal / P{fmtNum(value.proteinG)}g / 脂質{fmtNum(value.fatG)}g / 塩分
                  {fmtNum(value.saltG)}g
                </span>
                {entry.note !== '' && (
                  <span className="mt-0.5 block text-[11px] text-slate-400">原文: 「{entry.note}」</span>
                )}
              </span>
              <span className="pt-3 text-slate-300">›</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
