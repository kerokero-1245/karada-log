/**
 * 新しい食品（Food の下書き）の作り方。
 *
 * ★ ここは純関数だけ。DB も React も触らない。★
 * 食品マスタの行は、入力フォーム（lib/foodForm.ts）・貼り付けの推定（lib/importText.ts）・
 * 写真の推定（lib/photoMeal.ts）・初期データ（db/seed.ts）のどれでも、同じ既定値・同じキーの順で作る。
 * キーの順は IndexedDB に残り、JSON バックアップの行のキーの順になるので、変えない。
 * DB に足す処理は db/foods.ts の addFood。
 */
import type {
  EntryBasis,
  Food,
  FoodCategory,
  IsoDateTime,
  Nutrition,
  ValueSource,
} from "../db/types";

export interface NewFoodFields {
  name: string;
  unitLabel: string;
  gramsPerUnit: number | null;
  /** 1 単位あたりに正規化した栄養値 */
  per: Nutrition;
  source: ValueSource;
  basis: EntryBasis;
  category: FoodCategory;
  note: string;
  /** 呼び名。省略は空（推定で作る食品には付けない。付けると以後の照合が曖昧になる） */
  aliases?: string[];
  variantGroupId?: string | null;
  variantLabel?: string | null;
  archived?: boolean;
}

/** 新しい食品。使用回数は 0・最後に使った日時は無し・作成と更新は now */
export function newFood(
  fields: NewFoodFields,
  now: IsoDateTime,
): Omit<Food, "id"> {
  return {
    name: fields.name,
    unitLabel: fields.unitLabel,
    gramsPerUnit: fields.gramsPerUnit,
    per: fields.per,
    source: fields.source,
    basis: fields.basis,
    category: fields.category,
    note: fields.note,
    aliases: fields.aliases ?? [],
    variantGroupId: fields.variantGroupId ?? null,
    variantLabel: fields.variantLabel ?? null,
    useCount: 0,
    lastUsedAt: null,
    archived: fields.archived ?? false,
    createdAt: now,
    updatedAt: now,
  };
}
