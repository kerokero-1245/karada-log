/**
 * 栄養値の計算。
 * 未入力（null）を 0 として黙って足さない。足せなかった項目は数えて返し、
 * 画面で「未確認」と出せるようにする（原則1: 分からないものを埋めない）。
 */
import type { Nutrition, NutrientKey } from '../db/types';
import { NUTRIENT_KEYS } from '../db/types';

export const EMPTY_NUTRITION: Nutrition = {
  kcal: null,
  proteinG: null,
  fatG: null,
  carbG: null,
  saltG: null,
};

export interface NutritionTotal {
  value: Nutrition;
  /** 未入力のため合計に含められなかった件数（項目ごと） */
  unknown: Record<NutrientKey, number>;
}

/** 1単位あたりの値 × 数量 */
export function scaleNutrition(per: Nutrition, quantity: number): Nutrition {
  const out = { ...EMPTY_NUTRITION };
  for (const key of NUTRIENT_KEYS) {
    const v = per[key];
    out[key] = v === null ? null : round2(v * quantity);
  }
  return out;
}

/** 合計。null は加算せず unknown に数える */
export function sumNutrition(list: Nutrition[]): NutritionTotal {
  const value: Nutrition = { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, saltG: 0 };
  const unknown = { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, saltG: 0 } as Record<NutrientKey, number>;
  for (const n of list) {
    for (const key of NUTRIENT_KEYS) {
      const v = n[key];
      if (v === null) unknown[key] += 1;
      else value[key] = round2((value[key] ?? 0) + v);
    }
  }
  return { value, unknown };
}

/** 表示。null は '—' */
export function fmtNum(v: number | null, suffix = ''): string {
  if (v === null || Number.isNaN(v)) return '—';
  return `${round2(v)}${suffix}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
