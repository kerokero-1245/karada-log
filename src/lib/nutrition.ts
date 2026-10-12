/**
 * 栄養値の計算。
 * 未入力（null）を 0 として黙って足さない。足せなかった項目は数えて返し、
 * 画面で「未確認」と出せるようにする（原則1: 分からないものを埋めない）。
 */
import type { Food, Nutrition, NutrientKey } from "../db/types";
import { CORE_NUTRIENT_KEYS, NUTRIENT_KEYS } from "../db/types";
import { UNKNOWN_MARK } from "./format";
import { addRounded, formatNumber, round2, round3 } from "./number";

/**
 * 5 つの栄養値を、キーごとに fn で作って並べる。
 * 5 キーの手書きをここ 1 か所にする。キーの順は保存データ（Food.per・MealSnapshot.per）の順と同じ。
 */
export function mapNutrition<T>(
  fn: (key: NutrientKey) => T,
): Record<NutrientKey, T> {
  return {
    kcal: fn("kcal"),
    proteinG: fn("proteinG"),
    fatG: fn("fatG"),
    carbG: fn("carbG"),
    saltG: fn("saltG"),
  };
}

/** すべて未確認（null）の栄養値。毎回新しいオブジェクトを返す */
export function emptyNutrition(): Nutrition {
  return mapNutrition(() => null);
}

export const EMPTY_NUTRITION: Nutrition = emptyNutrition();

export interface NutritionTotal {
  value: Nutrition;
  /** 未入力のため合計に含められなかった件数（項目ごと） */
  unknown: Record<NutrientKey, number>;
}

/** 1単位あたりの値 × 数量 */
export function scaleNutrition(per: Nutrition, quantity: number): Nutrition {
  return mapNutrition((key) => {
    const v = per[key];
    return v === null ? null : round2(v * quantity);
  });
}

/**
 * その行ぜんたいの値 ÷ 数量 = 1 単位あたりの値。小数第 3 位で丸める。null は null のまま。
 * 貼り付けの値・写真の見積もり・入力フォームの換算で使う（scaleNutrition の逆）。
 */
export function divideNutrition(values: Nutrition, divisor: number): Nutrition {
  return mapNutrition((key) => {
    const v = values[key];
    return v === null ? null : round3(v / divisor);
  });
}

/** 合計。null は加算せず unknown に数える */
export function sumNutrition(list: Nutrition[]): NutritionTotal {
  const value: Nutrition = mapNutrition(() => 0);
  const unknown = mapNutrition(() => 0);
  for (const n of list) {
    for (const key of NUTRIENT_KEYS) {
      const v = n[key];
      if (v === null) unknown[key] += 1;
      else value[key] = addRounded(value[key] ?? 0, v);
    }
  }
  return { value, unknown };
}

/**
 * kcal・たんぱく質・脂質・塩分のどれかが未確認（null）か。炭水化物は見ない。
 * 画面（プレビュー・数量シート）と書き出しの「未確認」は、どれもこの規則。
 */
export function hasUnknownCore(n: Nutrition): boolean {
  return CORE_NUTRIENT_KEYS.some((key) => n[key] === null);
}

/**
 * 固定ベース（計画）の 1 品の栄養値。食品が見つからなければ null（0 で埋めない）。
 * ★ 計画値。実績（記録）の合計には混ぜない（原則 1）。実績は lib/mealView.ts の entryNutrition。★
 */
export function plannedNutrition(
  food: Food | undefined,
  quantity: number,
): Nutrition | null {
  return food ? scaleNutrition(food.per, quantity) : null;
}

/** 固定ベース（計画）の合計。値のある品目だけ足す。★ 計画値。実績の合計とは別のもの ★ */
export function plannedTotal(
  values: readonly (Nutrition | null)[],
): NutritionTotal {
  return sumNutrition(
    values.filter((value): value is Nutrition => value !== null),
  );
}

/** 表示。null は '—' */
export function fmtNum(v: number | null, suffix = ""): string {
  if (v === null || Number.isNaN(v)) return UNKNOWN_MARK;
  return `${formatNumber(v)}${suffix}`;
}
