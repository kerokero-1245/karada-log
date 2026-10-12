/**
 * 食事記録の表示と栄養値（純関数）。
 *
 * ★ ここは純関数だけ。DB も React も触らない。★
 * 記録の追加・更新・削除（DB への書き込み）は lib/meals.ts。
 * lib/importText.ts・lib/photoMeal.ts・lib/exportMarkdown.ts は「純関数だけ」の約束なので、
 * 必要なものはここから読む（meals.ts を読むと db.ts まで届いてしまう）。
 */
import type { Food, MealEntry, MealSnapshot, Nutrition } from "../db/types";
import { hasTime } from "./date";
import { scaleNutrition } from "./nutrition";
import { formatNumber } from "./number";

export function snapshotOf(food: Food): MealSnapshot {
  return {
    name: food.name,
    variantLabel: food.variantLabel,
    unitLabel: food.unitLabel,
    category: food.category,
    source: food.source,
    per: { ...food.per },
  };
}

/**
 * 時刻が 'HH:mm' でなければ保存しない。
 * 画面側でも止めているが、空の時刻が isoDateTimeIn に渡ると時刻なしの日時（'2026-10-05T'）が
 * できてしまうので、保存の入口でも弾く（トランザクションごと取り消される）。
 */
export function assertTime(time: string): void {
  if (!hasTime(time))
    throw new Error("時刻が入っていません。時刻を入れてから保存してください");
}

/** その記録の栄養値（1単位あたり × 数量） */
export function entryNutrition(entry: MealEntry): Nutrition {
  return scaleNutrition(entry.snapshot.per, entry.quantity);
}

/** 数量の表示。1 → '1' / 0.5 → '0.5' / 3 → '3' */
export function formatQuantity(quantity: number): string {
  return formatNumber(quantity);
}
