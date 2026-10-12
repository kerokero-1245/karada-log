/**
 * 食品の手選び（プレビューの行ごと）。テキスト記録と取り込みで同じ仕組みを使う。
 *
 * 行の位置（index）→ 選んだ食品の id と「手で選んだか」を覚え、選んだ食品があればそれを使って
 * 行の解釈を組み直す（lib/importText.ts の buildEntryView）。
 */
import { useState } from "react";
import type { Food } from "../db/types";
import { buildEntryView } from "./importText";
import type { EntryView } from "./importText";
import type { QuickResolution } from "./quickText";

interface Choice {
  foodId: number;
  manual: boolean;
}

export function useEntryChoices(foods: Food[], onChosen: () => void) {
  const [choices, setChoices] = useState<Record<number, Choice>>({});

  /** index 行の解釈。手で選んだ食品があればそれを使う */
  const viewOf = (index: number, resolution: QuickResolution): EntryView => {
    const choice = choices[index];
    const picked =
      choice === undefined
        ? null
        : (foods.find((food) => food.id === choice.foodId) ?? null);
    return buildEntryView(resolution, picked, choice?.manual ?? false);
  };

  /** 食品を選ぶ（保存前で id の無い食品は選べない）。選んだら onChosen（プレビューへ戻る）を呼ぶ */
  const choose = (index: number, food: Food, manual: boolean) => {
    const id = food.id;
    if (id === undefined) return;
    setChoices((prev) => ({ ...prev, [index]: { foodId: id, manual } }));
    onChosen();
  };

  /** 選んだものをすべて捨てる（テキストを直すと行の位置がずれるため） */
  const reset = () => setChoices({});

  return { viewOf, choose, reset };
}
