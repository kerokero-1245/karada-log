/**
 * 「この原文はどの食品か」を選ぶシート。
 * テキストで解釈できなかった項目から開く。既存の検索一覧（FoodList / VariantPicker）を流用する。
 *
 * ここでは記録しない。選んだ食品を呼び出し元に返すだけ（記録は「記録する」を押したとき）。
 */
import { useMemo, useState } from 'react';
import { db } from '../../db/db';
import type { Food } from '../../db/types';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { useLiveQuery } from '../../lib/useLiveQuery';
import { FoodList } from './FoodList';
import { VariantPicker } from './VariantPicker';
import type { FoodGroup } from './foodGroups';
import { groupFoods, matchesQuery, sortByFrequency } from './foodGroups';

export function FoodPickerSheet({
  subtitle,
  initialQuery,
  onPick,
  onNewFood,
  onBack,
  onClose,
}: {
  subtitle: string;
  initialQuery: string;
  onPick: (food: Food) => void;
  onNewFood: (name: string) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const foods = useLiveQuery(() => db.foods.toArray(), []);
  const [query, setQuery] = useState(initialQuery);
  const [showArchived, setShowArchived] = useState(false);
  const [group, setGroup] = useState<FoodGroup | null>(null);

  const groups = useMemo(() => {
    const visible = (foods ?? []).filter((food) => (showArchived || !food.archived) && matchesQuery(food, query));
    return sortByFrequency(groupFoods(visible));
  }, [foods, query, showArchived]);

  if (group !== null) {
    return (
      <VariantPicker group={group} onSelect={onPick} onBack={() => setGroup(null)} onClose={onClose} />
    );
  }

  return (
    <Sheet title="食品を選ぶ" subtitle={subtitle} onBack={onBack} onClose={onClose}>
      <div className="space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前・カテゴリで検索"
          aria-label="食品を検索"
          className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
        />

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">候補（{groups.length}件）</h3>
          <label className="flex min-h-11 items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-5 w-5"
            />
            在庫切れも表示する
          </label>
        </div>

        <FoodList
          groups={groups}
          onSelect={(selected) => {
            if (selected.foods.length > 1) setGroup(selected);
            else onPick(selected.foods[0]);
          }}
        />

        {groups.length === 0 && (
          <p className="rounded-xl bg-white p-3 text-center text-sm text-slate-600">
            一致する食品がありません。
          </p>
        )}

        <Button variant="primary" className="w-full" onClick={() => onNewFood(query.trim())}>
          {query.trim() === '' ? '新しい食品を登録' : `「${query.trim()}」をこの名前で新規登録`}
        </Button>
      </div>
    </Sheet>
  );
}
