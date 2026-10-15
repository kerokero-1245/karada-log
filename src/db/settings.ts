/**
 * 設定（Settings）の書き込みのうち、画面から値を変えるもの。
 * 入力の検証と保存の形（キーの順）は lib/bodyComposition.ts の buildGoalLine。
 * Claude API キーの出し入れは lib/apiKey.ts。
 */
import type { GoalLine } from "./types";
import { db } from "./db";
import { nowIso } from "../lib/date";

/** 体組成の目標ライン（脂肪量・除脂肪量・期日）を置き換える */
export async function saveGoalLine(goal: GoalLine): Promise<void> {
  await db.settings.update(1, { goal, updatedAt: nowIso() });
}
