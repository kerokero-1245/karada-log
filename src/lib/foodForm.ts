/**
 * 新規食品の簡易登録（F3 の最小版）の正規化とバリデーション。
 *
 * 店頭で栄養成分表示を見ながら打つので、入力は「ラベルの表記そのまま」を受け取り、
 * 保存時に **1単位あたり** へ正規化して Food.per に入れる。
 * 元の表記は Food.basis に残す（後から確認・再編集できるように）。
 *   例: マカダミアは「10gあたり76kcal」表記。1単位=10g で登録し、30g食べたら数量3。
 *   例: 「100gあたり」表記で1単位=30g なら、値 × 30/100 が1単位あたり。
 */
import type { EntryBasis, Food, FoodCategory, Nutrition, NutrientKey, ValueSource } from '../db/types';
import { NUTRIENT_KEYS } from '../db/types';
import { toIsoDateTime } from './date';

/** 表記の基準 3択 */
export type BasisKind = 'unit' | 'per100g' | 'bag';

export const BASIS_OPTIONS: { kind: BasisKind; label: string }[] = [
  { kind: 'unit', label: '1単位あたり' },
  { kind: 'per100g', label: '100gあたり' },
  { kind: 'bag', label: '1袋あたり' },
];

export interface FoodFormValues {
  name: string;
  category: FoodCategory;
  unitLabel: string;
  basisKind: BasisKind;
  /** 1単位のグラム数（100g・1袋 基準のときは必須） */
  gramsPerUnit: string;
  /** 1袋のグラム数（1袋基準のときは必須） */
  bagGrams: string;
  kcal: string;
  proteinG: string;
  fatG: string;
  carbG: string;
  saltG: string;
  source: ValueSource;
}

export function emptyFoodForm(name: string): FoodFormValues {
  return {
    name,
    category: 'その他',
    unitLabel: '1個',
    basisKind: 'unit',
    gramsPerUnit: '',
    bagGrams: '',
    kcal: '',
    proteinG: '',
    fatG: '',
    carbG: '',
    saltG: '',
    source: 'label',
  };
}

export const NUTRIENT_FIELDS: { key: NutrientKey; label: string; unit: string }[] = [
  { key: 'kcal', label: 'カロリー', unit: 'kcal' },
  { key: 'proteinG', label: 'たんぱく質', unit: 'g' },
  { key: 'fatG', label: '脂質', unit: 'g' },
  { key: 'carbG', label: '炭水化物', unit: 'g' },
  { key: 'saltG', label: '塩分', unit: 'g' },
];

export interface FoodFormResult {
  errors: string[];
  /** 1単位あたりに正規化した値（プレビュー用）。値が1つも無ければ全 null */
  preview: Nutrition;
  /** 表記1つ分が何単位にあたるか。'100gあたり' で 1単位=30g なら 100/30 */
  unitsPerBasis: number | null;
  basisLabel: string;
  /** エラーが無いときだけ埋まる */
  food: Omit<Food, 'id'> | null;
}

/** 空欄は null（0 で埋めない）。数値にならないものはエラー */
function parseNumber(text: string, label: string, errors: string[]): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) {
    errors.push(`${label}は0以上の数値で入力してください`);
    return null;
  }
  return value;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function buildFood(values: FoodFormValues): FoodFormResult {
  const errors: string[] = [];

  const name = values.name.trim();
  if (name === '') errors.push('名前を入力してください');
  const unitLabel = values.unitLabel.trim();
  if (unitLabel === '') errors.push('単位ラベルを入力してください（例: 1個 / 1食 / 10g）');

  const gramsPerUnit = parseNumber(values.gramsPerUnit, '1単位のグラム数', errors);
  const bagGrams = parseNumber(values.bagGrams, '1袋のグラム数', errors);

  let unitsPerBasis: number | null = null;
  let basisLabel = `${unitLabel || '1単位'}あたり`;

  if (values.basisKind === 'unit') {
    unitsPerBasis = 1;
  } else if (values.basisKind === 'per100g') {
    basisLabel = '100gあたり';
    if (gramsPerUnit === null || gramsPerUnit <= 0) {
      errors.push('100gあたりの表記から換算するため、1単位のグラム数が必要です');
    } else {
      // 丸めずに持つ（丸めると 100g→115g の換算で誤差が出る）
      unitsPerBasis = 100 / gramsPerUnit;
    }
  } else {
    basisLabel = bagGrams === null ? '1袋あたり' : `1袋(${bagGrams}g)あたり`;
    if (gramsPerUnit === null || gramsPerUnit <= 0) {
      errors.push('1袋あたりの表記から換算するため、1単位のグラム数が必要です');
    }
    if (bagGrams === null || bagGrams <= 0) {
      errors.push('1袋のグラム数を入力してください');
    }
    if (gramsPerUnit !== null && gramsPerUnit > 0 && bagGrams !== null && bagGrams > 0) {
      unitsPerBasis = bagGrams / gramsPerUnit;
    }
  }

  const entered: Nutrition = {
    kcal: parseNumber(values.kcal, 'カロリー', errors),
    proteinG: parseNumber(values.proteinG, 'たんぱく質', errors),
    fatG: parseNumber(values.fatG, '脂質', errors),
    carbG: parseNumber(values.carbG, '炭水化物', errors),
    saltG: parseNumber(values.saltG, '塩分', errors),
  };

  const preview: Nutrition = { kcal: null, proteinG: null, fatG: null, carbG: null, saltG: null };
  if (unitsPerBasis !== null && unitsPerBasis > 0) {
    for (const key of NUTRIENT_KEYS) {
      const value = entered[key];
      preview[key] = value === null ? null : round3(value / unitsPerBasis);
    }
  }

  if (errors.length > 0 || unitsPerBasis === null) {
    return { errors, preview, unitsPerBasis, basisLabel, food: null };
  }

  const now = toIsoDateTime(new Date());
  const basis: EntryBasis = { label: basisLabel, unitsPerBasis };
  const food: Omit<Food, 'id'> = {
    name,
    unitLabel,
    gramsPerUnit,
    per: preview,
    source: values.source,
    basis,
    category: values.category,
    note: '',
    variantGroupId: null,
    variantLabel: null,
    useCount: 0,
    lastUsedAt: null,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };

  return { errors, preview, unitsPerBasis, basisLabel, food };
}
