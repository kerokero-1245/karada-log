/**
 * 食品一覧の絞り込みと、バリアントの束ね。
 *
 * variantGroupId が同じ食品（カップヌードルBIG のスープ残し/完飲 など）は
 * 一覧では1行にまとめ、タップしたときにだけ選択させる。
 * 頻度は行単位（= バリアントの合計）で数えるが、記録は必ず1バリアントに落ちる。
 */
import type { Food, FoodCategory, IsoDateTime } from '../../db/types';

export interface FoodGroup {
  key: string;
  name: string;
  category: FoodCategory;
  /** 1件なら単独商品、2件以上ならバリアント */
  foods: Food[];
  useCount: number;
  lastUsedAt: IsoDateTime | null;
  /** すべて在庫切れか */
  archived: boolean;
}

/** 名前・バリアント名・カテゴリの部分一致 */
export function matchesQuery(food: Food, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  const haystack = `${food.name} ${food.variantLabel ?? ''} ${food.category}`.toLowerCase();
  return haystack.includes(q);
}

export function groupFoods(foods: Food[]): FoodGroup[] {
  const groups = new Map<string, FoodGroup>();
  for (const food of foods) {
    const key = food.variantGroupId ?? `food-${food.id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.foods.push(food);
      existing.useCount += food.useCount;
      existing.lastUsedAt = laterOf(existing.lastUsedAt, food.lastUsedAt);
      existing.archived = existing.archived && food.archived;
    } else {
      groups.set(key, {
        key,
        name: food.name,
        category: food.category,
        foods: [food],
        useCount: food.useCount,
        lastUsedAt: food.lastUsedAt,
        archived: food.archived,
      });
    }
  }
  for (const group of groups.values()) {
    // 使った回数が同じなら塩分の低い順（「汁は必ず残す」側を先に出す）
    group.foods.sort(
      (a, b) =>
        b.useCount - a.useCount ||
        (a.per.saltG ?? Number.POSITIVE_INFINITY) - (b.per.saltG ?? Number.POSITIVE_INFINITY) ||
        (a.variantLabel ?? '').localeCompare(b.variantLabel ?? '', 'ja'),
    );
  }
  return [...groups.values()];
}

/** よく食べるもの順: useCount 降順 → lastUsedAt 降順 → 名前順 */
export function sortByFrequency(groups: FoodGroup[]): FoodGroup[] {
  return [...groups].sort(
    (a, b) =>
      b.useCount - a.useCount ||
      compareIsoDesc(a.lastUsedAt, b.lastUsedAt) ||
      a.name.localeCompare(b.name, 'ja'),
  );
}

function laterOf(a: IsoDateTime | null, b: IsoDateTime | null): IsoDateTime | null {
  if (a === null) return b;
  if (b === null) return a;
  return a >= b ? a : b;
}

function compareIsoDesc(a: IsoDateTime | null, b: IsoDateTime | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a > b ? -1 : 1;
}
