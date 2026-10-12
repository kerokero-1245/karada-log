/**
 * 食品マスタへの書き込み。
 * 食品の下書きの作り方（既定値・キーの順）は lib/foods.ts の newFood。
 */
import type { Food } from "./types";
import { db } from "./db";
import { addedId } from "./keys";

/** 食品を足して、採番された id つきで返す。呼ぶ側のトランザクションの中でも外でも使える */
export async function addFood(draft: Omit<Food, "id">): Promise<Food> {
  const id = addedId(await db.foods.add(draft));
  return { ...draft, id };
}
