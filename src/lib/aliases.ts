/**
 * 食品の「呼び名」（Food.aliases）。
 *
 * チャット風テキストで「ザバス」「卵」「スムージー」と書いたときに
 * どの食品のことか分かるようにするための別名。
 *
 * 学習のルール:
 *  - 自動では増やさない。ユーザーが手で解決した（候補を選んだ / 食品を選んだ）ときだけ増やす
 *  - 他の食品の名前・呼び名と正規化キーが衝突するものは追加しない。
 *    1つの言葉が2つの食品を指すようになると、次から「候補を選ぶ」が増えて逆に遅くなる
 *  - ユーザーが付けた呼び名は、初期データの更新で消さない
 */
import type { Food } from '../db/types';
import { normalize } from './quickText';

/** 旧バージョンのレコード（aliases を持たない）でも落ちないようにする */
export function aliasesOf(food: Food): string[] {
  return Array.isArray(food.aliases) ? food.aliases : [];
}

/** 既存のものを残したまま追加する。正規化キーが同じものは足さない */
export function mergeAliases(current: string[], additions: string[]): string[] {
  const merged = [...current];
  const keys = new Set(merged.map(normalize));
  for (const addition of additions) {
    const text = addition.trim();
    const key = normalize(text);
    if (text === '' || key === '' || keys.has(key)) continue;
    merged.push(text);
    keys.add(key);
  }
  return merged;
}

/**
 * その呼び名を覚えてよいか。
 * 他の食品の名前・呼び名とぶつかるなら覚えない（曖昧さを増やさない）。
 */
export function canLearnAlias(alias: string, foodId: number, foods: Food[]): boolean {
  const key = normalize(alias);
  if (key === '') return false;
  for (const food of foods) {
    if (food.id === foodId) continue;
    if (normalize(food.name) === key) return false;
    if (aliasesOf(food).some((existing) => normalize(existing) === key)) return false;
  }
  return true;
}

/** すでに名前そのもの / 登録済みの呼び名なら、覚える必要がない */
export function alreadyKnown(alias: string, food: Food): boolean {
  const key = normalize(alias);
  if (key === '') return true;
  if (normalize(food.name) === key) return true;
  return aliasesOf(food).some((existing) => normalize(existing) === key);
}
