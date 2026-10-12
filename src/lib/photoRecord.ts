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
 * 作り方はテキスト記録と共有（lib/quickRecord.ts の addEntryPlans）。
 * addEntryPlans が張るのは addMealEntries と同じ db.transaction('rw', [mealEntries, foods]) の
 * 入れ子で、ここの親トランザクション（同じ2テーブル・同じ 'rw'）の中から呼んでも問題ない
 * （理由は lib/quickRecord.ts の冒頭に書いたとおり。dexie は親の IDB
 * トランザクションを使い回し、子がこけたら親ごと巻き戻る）。
 */
import { db } from "../db/db";
import type { LogDate } from "../db/types";
import { estimatedFoodOf, photoNoteOf } from "./photoMeal";
import type { PhotoMealRow } from "./photoMeal";
import { addEntryPlans } from "./quickRecord";
import type { QuickCommitResult, QuickEntryPlan } from "./quickRecord";

export interface PhotoEntryPlan {
  row: PhotoMealRow;
  /** 画面で直したあとの数量 */
  quantity: number;
  /** 'HH:mm' */
  time: string;
}

/** 写真の記録の結果。テキスト記録と同じ形（createdFoods は画面のお知らせに出す） */
export type PhotoCommitResult = QuickCommitResult;

/** 写真の 1 品を、記録の計画（テキスト記録・取り込みと同じ形）に直す。マスタに無い品目は推定食品の下書きを付ける */
function entryPlanOf(plan: PhotoEntryPlan): QuickEntryPlan {
  const matched = plan.row.matched;
  return {
    food: matched,
    draft: matched === null ? estimatedFoodOf(plan.row.item) : null,
    quantity: plan.quantity,
    time: plan.time,
    raw: photoNoteOf(plan.row.item),
    // 呼び名は学習しない（写真の品目名はユーザー自身の言葉ではない）
    manual: false,
    learnText: "",
  };
}

export async function commitPhotoMeal(
  logDate: LogDate,
  plans: PhotoEntryPlan[],
  boundaryHour: number,
): Promise<PhotoCommitResult> {
  let createdFoods = 0;

  await db.transaction("rw", [db.mealEntries, db.foods], async () => {
    const result = await addEntryPlans(
      logDate,
      plans.map(entryPlanOf),
      boundaryHour,
    );
    createdFoods = result.createdFoods;
  });

  return { added: plans.length, pending: 0, learned: [], createdFoods };
}
