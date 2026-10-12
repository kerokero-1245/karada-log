/**
 * 栄養値の 1 行の文字列（kcal・P・脂質・塩分をスラッシュで区切った 1 行）。
 *
 * 一覧・合計・プレビュー・開発用の確認で同じ書き方を使うための純関数。画面は components/NutritionLine.tsx が
 * これを出すだけ。桁はここで選ぶ（DESIGN.md「数値の整形と丸め」）:
 *  - kcal: total（合計・整数）/ item（1 品の行・小数第 1 位）/ stored（開発用・丸めない）
 *  - たんぱく質・脂質・炭水化物・塩分: rounded（小数第 2 位で丸めた値）/ stored（開発用・丸めない）
 * 欠けた値（null）は未確認の印（—）。
 */
import { NUTRIENT_LABELS } from "../db/types";
import type { NutrientKey, Nutrition } from "../db/types";
import { fmtStored } from "./format";
import { fmtKcal, fmtKcalItem } from "./formatKcal";
import { fmtNum } from "./nutrition";

const KCAL_FORMATS = {
  total: fmtKcal,
  item: fmtKcalItem,
  stored: fmtStored,
} as const;

const GRAM_FORMATS = {
  rounded: fmtNum,
  stored: fmtStored,
} as const;

export interface NutritionLineOptions {
  /** kcal の桁。既定は 1 品の行（item） */
  kcal?: keyof typeof KCAL_FORMATS;
  /** g の栄養素の桁。既定は小数第 2 位で丸めた値（rounded） */
  grams?: keyof typeof GRAM_FORMATS;
  /** g の単位を付けるか。開発用のデータ確認の固定ベースの行だけ付けない */
  unit?: boolean;
  /** 炭水化物を脂質と塩分の間に出すか。開発用の食品マスタの行だけ */
  carb?: boolean;
  /** 塩分を出すか。食べ方の選択では塩分を大きく別に出すので、ここでは出さない */
  salt?: boolean;
}

export function nutritionLineText(
  value: Nutrition,
  {
    kcal = "item",
    grams = "rounded",
    unit = true,
    carb = false,
    salt = true,
  }: NutritionLineOptions = {},
): string {
  const formatGram = GRAM_FORMATS[grams];
  const suffix = unit ? "g" : "";
  const gram = (key: NutrientKey) =>
    `${NUTRIENT_LABELS[key]}${formatGram(value[key])}${suffix}`;
  return [
    `${KCAL_FORMATS[kcal](value.kcal)}${NUTRIENT_LABELS.kcal}`,
    gram("proteinG"),
    gram("fatG"),
    ...(carb ? [gram("carbG")] : []),
    ...(salt ? [gram("saltG")] : []),
  ].join(" / ");
}
