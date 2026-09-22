/**
 * 貼り付けたテキストの「○件を取り込む」。
 *
 * ★ ここが呼ばれるのは、ユーザーがプレビューを見てボタンを押したときだけ。★
 *   解釈（lib/importText.ts）は何度走っても DB を触らない。
 *   押して初めて、推定食品・記録・未処理ができる（原則1）。
 *
 * 1回の操作で起きることを1トランザクションにまとめる:
 *   1. 「置き換える」を選んだ日の、既存の MealEntry を消す
 *   2. 推定食品を作る → その日の MealEntry を作る（原文は note に残す）
 *   3. 解決できなかった原文を、その行の日付で pendingTexts に預ける
 *   4. 手で解決した項目の呼び名を覚える
 *
 * 途中でこけたら全部戻る。半分だけ消えて半分だけ入る、が起きないようにしている。
 * 部品（addEntryPlans / learnFromPlans / addPendingPlans）はテキスト記録と共有。
 */
import { db } from '../db/db';
import type { LogDate } from '../db/types';
import { addEntryPlans, addPendingPlans, learnFromPlans } from './quickRecord';
import type { LearnedAlias, QuickCommitResult, QuickEntryPlan, QuickPendingPlan } from './quickRecord';

export interface ImportDayPlan {
  logDate: LogDate;
  /** true ならこの日の既存の記録を消してから入れる */
  replace: boolean;
  entries: QuickEntryPlan[];
  pending: QuickPendingPlan[];
}

export interface ImportCommitResult extends QuickCommitResult {
  /** 記録が入った日数（完了表示の「○日分」） */
  days: number;
  /** 置き換えた日数 */
  replacedDays: number;
  /** 置き換えで消した記録の件数 */
  removed: number;
}

export async function commitImport(
  plans: ImportDayPlan[],
  boundaryHour: number,
): Promise<ImportCommitResult> {
  let added = 0;
  let pending = 0;
  let createdFoods = 0;
  let removed = 0;
  let days = 0;
  let replacedDays = 0;
  let learned: LearnedAlias[] = [];

  await db.transaction('rw', [db.mealEntries, db.foods, db.pendingTexts], async () => {
    for (const plan of plans) {
      if (plan.replace) {
        removed += await db.mealEntries.where('logDate').equals(plan.logDate).delete();
        replacedDays += 1;
      }
    }

    for (const plan of plans) {
      const result = await addEntryPlans(plan.logDate, plan.entries, boundaryHour);
      added += result.added;
      createdFoods += result.createdFoods;
      if (result.added > 0) days += 1;

      await addPendingPlans(plan.logDate, plan.pending, boundaryHour);
      pending += plan.pending.length;
    }

    learned = await learnFromPlans(plans.flatMap((plan) => plan.entries));
  });

  return { added, pending, learned, createdFoods, days, replacedDays, removed };
}
