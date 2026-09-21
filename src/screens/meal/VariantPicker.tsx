/**
 * バリアントの選択（カップヌードルBIG のスープ残し/完飲 など）。
 * 選ぶ基準は塩分なので、塩分だけ大きく出す。
 */
import type { Food } from '../../db/types';
import type { FoodGroup } from './foodGroups';
import { Sheet } from '../../components/Sheet';
import { Badge } from '../../components/ui';
import { fmtNum } from '../../lib/nutrition';

export function VariantPicker({
  group,
  onSelect,
  onBack,
  onClose,
}: {
  group: FoodGroup;
  onSelect: (food: Food) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={group.name} subtitle="食べ方を選んでください" onBack={onBack} onClose={onClose}>
      <ul className="space-y-2">
        {group.foods.map((food) => (
          <li key={food.id}>
            <button
              type="button"
              onClick={() => onSelect(food)}
              className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm active:bg-slate-50"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-1.5">
                  <span className="text-base font-bold text-slate-800">{food.variantLabel ?? '標準'}</span>
                  {food.source === 'estimated' && <Badge tone="amber">推定値</Badge>}
                  {food.archived && <Badge tone="slate">在庫切れ</Badge>}
                </span>
                <span className="mt-1 block text-xs tabular-nums text-slate-500">
                  {food.unitLabel} / {fmtNum(food.per.kcal)}kcal / P{fmtNum(food.per.proteinG)}g / 脂質
                  {fmtNum(food.per.fatG)}g
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[10px] text-slate-500">塩分</span>
                <span className="block text-2xl font-bold tabular-nums text-slate-900">
                  {fmtNum(food.per.saltG)}
                  <span className="text-sm">g</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
