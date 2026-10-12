/**
 * 栄養値の 1 行表示。文字列だけを返す（囲みの要素は付けない）ので、呼ぶ側の <p> や <span>
 * （文字の大きさ・色・数字の幅）の中にそのまま置ける。桁の選び方は lib/nutritionLine.ts。
 */
import type { Nutrition } from "../db/types";
import { nutritionLineText } from "../lib/nutritionLine";
import type { NutritionLineOptions } from "../lib/nutritionLine";

export function NutritionLine({
  value,
  ...options
}: { value: Nutrition } & NutritionLineOptions) {
  return <>{nutritionLineText(value, options)}</>;
}
