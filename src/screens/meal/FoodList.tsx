/** 食品の一覧（バリアントは1行）。タップで選択に進む。 */
import type { FoodGroup } from './foodGroups';
import { fmtNum } from '../../lib/nutrition';
import { Badge } from '../../components/ui';

export function FoodList({
  groups,
  onSelect,
}: {
  groups: FoodGroup[];
  onSelect: (group: FoodGroup) => void;
}) {
  if (groups.length === 0) return null;

  return (
    <ul className="divide-y divide-slate-100 rounded-xl bg-white">
      {groups.map((group) => {
        const first = group.foods[0];
        const hasVariants = group.foods.length > 1;
        return (
          <li key={group.key}>
            <button
              type="button"
              onClick={() => onSelect(group)}
              className="flex min-h-14 w-full items-center gap-2 px-3 py-2 text-left active:bg-slate-50"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                  <span className="text-sm font-medium text-slate-800">{group.name}</span>
                  {hasVariants && <Badge tone="blue">バリアント{group.foods.length}件</Badge>}
                  {!hasVariants && first.source === 'estimated' && <Badge tone="amber">推定値</Badge>}
                  {group.archived && <Badge tone="slate">在庫切れ</Badge>}
                </span>
                <span className="mt-0.5 block text-xs tabular-nums text-slate-500">
                  {hasVariants ? (
                    <>
                      {group.foods.map((f) => `${f.variantLabel ?? '—'} 塩分${fmtNum(f.per.saltG)}g`).join(' / ')}
                    </>
                  ) : (
                    <>
                      {first.unitLabel} / {fmtNum(first.per.kcal)}kcal / P{fmtNum(first.per.proteinG)}g / 脂質
                      {fmtNum(first.per.fatG)}g / 塩分{fmtNum(first.per.saltG)}g
                    </>
                  )}
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-400">
                  {group.category}
                  {group.useCount > 0 && ` ・ ${group.useCount}回`}
                </span>
              </span>
              <span className="text-slate-300">›</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
