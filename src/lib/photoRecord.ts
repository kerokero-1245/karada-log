/**
 * 料理の写真の「○件を記録」。
 *
 * ★ ここが呼ばれるのは、ユーザーがプレビューを見てボタンを押したときだけ。★
 *   見積もり（lib/vision.ts）も行の組み立て（lib/photoMeal.ts）も DB を触らない。
 *   押して初めて、推定食品と記録ができる（原則1）。
 *
 * 1回の操作で起きることを1トランザクションにまとめる:
 *   1. マスタに無かった品目を Food（source='estimated'）として作る
 *   2. すべての品目を MealEntry にする（note に「写真: 原文」を残す）
 *
 * addMealEntries は自前で db.transaction('rw', [mealEntries, foods]) を張るが、
 * ここの親トランザクション（同じ2テーブル・同じ 'rw'）の中から呼んでも問題ない
 * （理由は lib/quickRecord.ts の冒頭に書いたとおり。dexie は親の IDB
 * トランザクションを使い回し、子がこけたら親ごと巻き戻る）。
 */
import { db } from '../db/db';
import type { Food, LogDate } from '../db/types';
import { addMealEntries } from './meals';
import type { NewMealInput } from './meals';
import { estimatedFoodOf, photoNoteOf } from './photoMeal';
import type { PhotoMealRow } from './photoMeal';
import type { QuickCommitResult } from './quickRecord';

export interface PhotoEntryPlan {
  row: PhotoMealRow;
  /** 画面で直したあとの数量 */
  quantity: number;
  /** 'HH:mm' */
  time: string;
}

export interface PhotoCommitResult extends QuickCommitResult {
  /** 今回新しく作った推定食品の数（画面のお知らせに出す） */
  createdFoods: number;
}

export async function commitPhotoMeal(
  logDate: LogDate,
  plans: PhotoEntryPlan[],
  boundaryHour: number,
): Promise<PhotoCommitResult> {
  let createdFoods = 0;

  await db.transaction('rw', [db.mealEntries, db.foods], async () => {
    const inputs: NewMealInput[] = [];

    for (const plan of plans) {
      let food = plan.row.matched;
      if (food === null) {
        const draft = estimatedFoodOf(plan.row.item);
        const id = (await db.foods.add(draft as Food)) as number;
        food = { ...(draft as Food), id };
        createdFoods += 1;
      }
      inputs.push({
        food,
        quantity: plan.quantity,
        time: plan.time,
        note: photoNoteOf(plan.row.item),
      });
    }

    if (inputs.length > 0) {
      await addMealEntries(logDate, inputs, null, boundaryHour);
    }
  });

  return { added: plans.length, pending: 0, learned: [], createdFoods };
}
