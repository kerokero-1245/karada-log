/**
 * 食事記録（MealEntry）の追加・更新・削除。
 *
 * 原則1: ここを呼ぶのは **ユーザーが明示的にタップしたとき だけ**。
 * 固定ベース（ShortcutSet）を開いただけでは呼ばない。
 *
 * 追加時は食品情報のスナップショットを持たせる（後からマスタを直しても実績が動かない）。
 * 同じトランザクションで Food.useCount を +1 し lastUsedAt を更新する（F2 の頻度順表示用）。
 *
 * 表示と栄養値の純関数（formatQuantity・entryNutrition・snapshotOf・assertTime）は lib/mealView.ts。
 */
import { db } from "../db/db";
import { addedId } from "../db/keys";
import type { Food, LogDate, MealEntry } from "../db/types";
import { isoDateTimeIn, nowIso, toLogDate } from "./date";
import { assertTime, snapshotOf } from "./mealView";

export interface NewMealInput {
  food: Food;
  quantity: number;
  /** 'HH:mm'。その論理日付の中の時刻として解釈する */
  time: string;
  /**
   * 記録に残すメモ。チャット風テキストから入れたときは原文をそのまま渡す。
   * 省略時は空文字（既存の呼び出しはこれまでどおり）。
   */
  note?: string;
}

/**
 * 記録を追加する。固定ベースからの一括追加も同じ経路を通す（1トランザクション）。
 * fromShortcutSetId は「どのショートカットのタップで入ったか」の記録であって、
 * 自動計上のフラグではない。
 */
export async function addMealEntries(
  logDate: LogDate,
  inputs: NewMealInput[],
  fromShortcutSetId: number | null,
  boundaryHour?: number,
): Promise<number[]> {
  for (const input of inputs) assertTime(input.time);
  const now = nowIso();
  const ids: number[] = [];

  await db.transaction("rw", [db.mealEntries, db.foods], async () => {
    for (const input of inputs) {
      const foodId = input.food.id;
      if (foodId === undefined) throw new Error("食品が保存されていません");

      const recordedAt = isoDateTimeIn(logDate, input.time, boundaryHour);
      const entry: MealEntry = {
        foodId,
        quantity: input.quantity,
        recordedAt,
        logDate: toLogDate(recordedAt, boundaryHour),
        snapshot: snapshotOf(input.food),
        fromShortcutSetId,
        note: input.note ?? "",
      };
      ids.push(addedId(await db.mealEntries.add(entry)));

      // 頻度は「その時点の DB の値」を基準に増やす（渡された Food が古くても壊れない）
      const stored = await db.foods.get(foodId);
      if (stored) {
        await db.foods.update(foodId, {
          useCount: stored.useCount + 1,
          lastUsedAt: now,
        });
      }
    }
  });

  return ids;
}

/**
 * 数量・時刻の変更。
 * 時刻だけ変えても論理日付は動かさない（日付の移動は今回のスコープ外）。
 */
export async function updateMealEntry(
  entry: MealEntry,
  quantity: number,
  time: string,
  boundaryHour?: number,
): Promise<void> {
  if (entry.id === undefined) return;
  assertTime(time);
  await db.mealEntries.update(entry.id, {
    quantity,
    recordedAt: isoDateTimeIn(entry.logDate, time, boundaryHour),
  });
}

export async function deleteMealEntry(entry: MealEntry): Promise<void> {
  if (entry.id === undefined) return;
  await db.mealEntries.delete(entry.id);
}
