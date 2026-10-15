/**
 * 体組成・骨密度の書き込み（F5）。
 * 保存する行の作り方（検証・測定条件の計算・キーの順）は lib/bodyComposition.ts。
 * 食事の記録・トレーニングの記録には書き込まない。
 */
import type { BodyComposition, BoneDensity } from "./types";
import { db } from "./db";
import { addedId } from "./keys";

export async function addBodyComposition(
  record: Omit<BodyComposition, "id">,
): Promise<number> {
  return addedId(await db.bodyCompositions.add(record));
}

export async function deleteBodyComposition(id: number): Promise<void> {
  await db.bodyCompositions.delete(id);
}

export async function addBoneDensity(
  record: Omit<BoneDensity, "id">,
): Promise<number> {
  return addedId(await db.boneDensities.add(record));
}

export async function deleteBoneDensity(id: number): Promise<void> {
  await db.boneDensities.delete(id);
}
