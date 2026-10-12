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

/**
 * 1 行を、値と「kcal / P」「g / 脂質」のような区切りに分けた配列で返す。
 * 画面（components/NutritionLine.tsx）はこの配列の 1 つずつを別のテキストノードとして出す。
 * 以前の画面は値ごとに {…} で書いていたのでテキストノードが値と区切りで分かれており、1 つの文字列にまとめると
 * 全体の幅が 1/64px 単位で変わって字の位置がずれるため、区切りを元のままにしている。
 */
export function nutritionLineParts(
  value: Nutrition,
  {
    kcal = "item",
    grams = "rounded",
    unit = true,
    carb = false,
    salt = true,
  }: NutritionLineOptions = {},
): string[] {
  const formatGram = GRAM_FORMATS[grams];
  const suffix = unit ? "g" : "";
  const keys: NutrientKey[] = [
    "proteinG",
    "fatG",
    ...(carb ? (["carbG"] as const) : []),
    ...(salt ? (["saltG"] as const) : []),
  ];
  // 値 → 「単位 / 次の見出し」→ 値 → … → 単位（単位が無いときは最後の単位を出さない）
  const parts = [
    KCAL_FORMATS[kcal](value.kcal),
    `${NUTRIENT_LABELS.kcal} / ${NUTRIENT_LABELS[keys[0]]}`,
  ];
  keys.forEach((key, i) => {
    parts.push(formatGram(value[key]));
    const next = keys[i + 1];
    if (next !== undefined) parts.push(`${suffix} / ${NUTRIENT_LABELS[next]}`);
    else if (suffix !== "") parts.push(suffix);
  });
  return parts;
}

/** 1 行の文字列（区切りをつないだもの） */
export function nutritionLineText(
  value: Nutrition,
  options: NutritionLineOptions = {},
): string {
  return nutritionLineParts(value, options).join("");
}
