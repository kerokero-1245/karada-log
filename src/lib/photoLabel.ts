/**
 * 栄養成分表示の読み取り結果 → 新規登録フォームの初期値。
 *
 * ★ ここでは保存しない。★
 *   フォームを「埋めた状態で開く」だけ。ユーザーが「登録」を押して初めて
 *   既存の正規化ロジック（lib/foodForm.ts の buildFood）を通って保存される。
 *   読み取りが外れていても、押す前に直せる。
 *
 * 単位の決め方:
 *  - per_100g → 1単位 = 100g にする。「100gあたり」表記のまま登録し、150g食べたら数量1.5。
 *  - per_package → 1単位 = 1袋。袋のグラム数が読めていれば gramsPerUnit に入れる。
 *  - per_unit → ラベルの表記から「1食」「2個」のような単位を拾う。拾えなければ「1食」。
 */
import type { FoodFormValues } from './foodForm';
import { emptyFoodForm } from './foodForm';
import type { LabelRead } from './vision';

/** ラベルによく出る数え方。長いものから先に見る */
const UNIT_WORDS = ['切れ', 'パック', '個', '本', '枚', '袋', '杯', '食', '缶', '玉', '粒', '尾'];
const UNIT_PATTERN = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT_WORDS.join('|')})`);

/** '1食（80g）あたり' → '1食'。拾えなければ null */
export function unitLabelFromBasisLabel(basisLabel: string): string | null {
  const matched = UNIT_PATTERN.exec(basisLabel.normalize('NFKC'));
  return matched === null ? null : `${matched[1]}${matched[2]}`;
}

function numberText(value: number | null): string {
  return value === null ? '' : String(value);
}

/** 読み取り結果でフォームを埋める。保存はしない */
export function formValuesFromLabel(read: LabelRead): FoodFormValues {
  const base = emptyFoodForm(read.name ?? '');
  const fromLabel = unitLabelFromBasisLabel(read.basisLabel);

  const values: FoodFormValues = {
    ...base,
    // カテゴリはラベルからは分からない。既定の「その他」のままにして、必要なら選んでもらう
    category: 'その他',
    kcal: numberText(read.kcal),
    proteinG: numberText(read.proteinG),
    fatG: numberText(read.fatG),
    carbG: numberText(read.carbG),
    saltG: numberText(read.saltG),
    source: 'label',
  };

  if (read.basis === 'per_100g') {
    return {
      ...values,
      basisKind: 'per100g',
      unitLabel: '100g',
      // 1単位=100g なので換算は等倍になる（buildFood の 100 ÷ 100）
      gramsPerUnit: '100',
    };
  }

  if (read.basis === 'per_package') {
    return {
      ...values,
      basisKind: 'unit',
      unitLabel: fromLabel ?? '1袋',
      gramsPerUnit: numberText(read.gramsPerBasis),
    };
  }

  return {
    ...values,
    basisKind: 'unit',
    unitLabel: fromLabel ?? '1食',
    gramsPerUnit: numberText(read.gramsPerBasis),
  };
}

/** 読み取り結果に添える但し書き。自信が低いときは必ず出す */
export function labelNotice(read: LabelRead): string | null {
  const lines: string[] = [];
  if (read.confidence === 'low') lines.push('読み取りに自信がありません。ラベルと見比べてください。');
  if (read.notes.trim() !== '') lines.push(read.notes.trim());
  return lines.length === 0 ? null : lines.join('\n');
}
