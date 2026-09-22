/**
 * チャット風テキストの「記録する」。
 *
 * ★ ここが呼ばれるのは、ユーザーがプレビューを見て「○件を記録」を押したときだけ。★
 *   解釈（lib/quickText.ts）は何度走っても DB を触らない。
 *   押して初めて MealEntry ができる（原則1）。
 *
 * 1回の操作で起きることを1トランザクションにまとめる:
 *   1. 栄養値を貼ってあってマスタに無い項目を、推定の Food として作る
 *   2. 確定した項目を MealEntry にする（原文は note に残す）
 *   3. 手で解決した項目の呼び名を覚える（衝突しないものだけ）
 *   4. 解決できなかった原文を pendingTexts に預ける（栄養値は持たせない）
 *   5. 未処理テキストから開き直した場合は、その元の行を消す
 *
 * 中身は取り込みシート（lib/importRecord.ts）と共有している。
 * 記録・呼び名・未処理の作り方を二重に持ちたくないため。
 *
 * addMealEntries は自前で `db.transaction('rw', [mealEntries, foods])` を張るが、
 * ここの親トランザクション（[mealEntries, foods, pendingTexts]）の中から呼んでも問題ない。
 * dexie 4.4.6 の実装で確認した挙動:
 *   - Dexie.prototype._transaction: 親と同じ db・親が READONLY でない・対象ストアが
 *     すべて親の storeNames に含まれる、を満たせば SubTransaction 例外は出ない。
 *     こちらの [mealEntries, foods] は親の部分集合で、モードも 'rw' どうし。
 *   - enterTransactionScope: 親がある場合は `trans.idbtrans = parentTransaction.idbtrans`
 *     として **親の IndexedDB トランザクションをそのまま使い回す**（trans.create() を呼ばない）。
 *     IDB トランザクションが2本立たないので、待ち合わせで固まることもない。
 *   - Transaction は親を持ち、子が失敗すると `this.parent._reject(e)` で親も巻き戻る。
 * つまり「記録・呼び名・未処理」は全部入るか全部入らないかのどちらかになる。
 * snapshot / logDate / useCount の作り方を二重に持ちたくないので、この形を採る。
 */
import { db } from '../db/db';
import type { Food, LogDate, PendingText } from '../db/types';
import { addMealEntries } from './meals';
import type { NewMealInput } from './meals';
import { aliasesOf, alreadyKnown, canLearnAlias, mergeAliases } from './aliases';
import { isoDateTimeIn, toIsoDateTime } from './date';

export interface QuickEntryPlan {
  /** マスタの食品。推定で新しく作る項目は null */
  food: Food | null;
  /**
   * 推定食品の下書き（lib/importText.ts）。記録を押したときに初めて作る。
   * マスタの食品を使うときは null。
   */
  draft: Omit<Food, 'id'> | null;
  quantity: number;
  /** 'HH:mm' */
  time: string;
  /** 原文。MealEntry.note に入る */
  raw: string;
  /** 手で解決したか（候補を選んだ / 食品を選んだ）。呼び名を覚える対象 */
  manual: boolean;
  /** 覚える呼び名の候補＝原文の名前部分（数量・単位・時刻を除いた表記） */
  learnText: string;
}

export interface QuickPendingPlan {
  raw: string;
  reason: string;
  /** 'HH:mm' */
  time: string;
}

export interface LearnedAlias {
  text: string;
  foodName: string;
}

export interface QuickCommitResult {
  added: number;
  pending: number;
  learned: LearnedAlias[];
  /** 今回新しく作った推定食品の数 */
  createdFoods: number;
}

/* ------------------------------------------------------------------ */
/* 部品（取り込みシートと共有）                                           */
/* ------------------------------------------------------------------ */

/**
 * 1日ぶんの記録を作る。推定の下書きがあれば先に Food を作る。
 * ★ 呼ぶ側が 'rw' トランザクション（mealEntries + foods）を張っていること。★
 */
export async function addEntryPlans(
  logDate: LogDate,
  entries: QuickEntryPlan[],
  boundaryHour: number,
): Promise<{ added: number; createdFoods: number }> {
  const inputs: NewMealInput[] = [];
  let createdFoods = 0;

  for (const entry of entries) {
    let food = entry.food;
    if (food === null) {
      if (entry.draft === null) continue;
      const id = (await db.foods.add(entry.draft as Food)) as number;
      food = { ...(entry.draft as Food), id };
      createdFoods += 1;
    }
    inputs.push({ food, quantity: entry.quantity, time: entry.time, note: entry.raw });
  }

  if (inputs.length > 0) {
    await addMealEntries(logDate, inputs, null, boundaryHour);
  }
  return { added: inputs.length, createdFoods };
}

/**
 * 呼び名の学習。**手で解決したものだけ**（自動では増やさない）。
 * 判断材料は「そのときの DB の中身」。
 */
export async function learnFromPlans(entries: QuickEntryPlan[]): Promise<LearnedAlias[]> {
  const learned: LearnedAlias[] = [];
  const foods = await db.foods.toArray();

  for (const entry of entries) {
    if (!entry.manual || entry.food === null) continue;
    const foodId = entry.food.id;
    if (foodId === undefined) continue;

    const text = entry.learnText.trim();
    if (text === '') continue;

    const stored = foods.find((food) => food.id === foodId);
    if (stored === undefined) continue;
    if (alreadyKnown(text, stored)) continue;
    if (!canLearnAlias(text, foodId, foods)) continue;

    const merged = mergeAliases(aliasesOf(stored), [text]);
    await db.foods.update(foodId, { aliases: merged, updatedAt: toIsoDateTime(new Date()) });
    // 同じテキストが2項目に出てきたときに二重で覚えないよう、手元の配列も更新する
    stored.aliases = merged;
    learned.push({ text, foodName: stored.name });
  }
  return learned;
}

/** 解決できなかった原文を預ける。★ 栄養値は持たせない（集計に入れない）★ */
export async function addPendingPlans(logDate: LogDate, pending: QuickPendingPlan[], boundaryHour: number): Promise<void> {
  if (pending.length === 0) return;
  const now = toIsoDateTime(new Date());
  const rows: PendingText[] = pending.map((item) => ({
    text: item.raw,
    reason: item.reason,
    logDate,
    recordedAt: isoDateTimeIn(logDate, item.time, boundaryHour),
    createdAt: now,
  }));
  await db.pendingTexts.bulkAdd(rows);
}

export async function commitQuickText(
  logDate: LogDate,
  entries: QuickEntryPlan[],
  pending: QuickPendingPlan[],
  sourcePendingId: number | null,
  boundaryHour: number,
): Promise<QuickCommitResult> {
  let learned: LearnedAlias[] = [];
  let added = 0;
  let createdFoods = 0;

  await db.transaction('rw', [db.mealEntries, db.foods, db.pendingTexts], async () => {
    const result = await addEntryPlans(logDate, entries, boundaryHour);
    added = result.added;
    createdFoods = result.createdFoods;

    learned = await learnFromPlans(entries);
    await addPendingPlans(logDate, pending, boundaryHour);

    if (sourcePendingId !== null) {
      await db.pendingTexts.delete(sourcePendingId);
    }
  });

  return { added, pending: pending.length, learned, createdFoods };
}

/** 未処理テキストを1件捨てる（「これはもういい」） */
export async function deletePendingText(id: number): Promise<void> {
  await db.pendingTexts.delete(id);
}
