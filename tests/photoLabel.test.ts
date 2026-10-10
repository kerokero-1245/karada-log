/**
 * 栄養成分表示の読み取り結果 → 新規登録フォームの初期値（lib/photoLabel.ts）の今の出力を固定する特性テスト。
 *
 * 読み取りの結果で「フォームを埋めるだけ」。保存はしない。値は架空のサンプル。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formValuesFromLabel,
  labelNotice,
  unitLabelFromBasisLabel,
} from "../src/lib/photoLabel.ts";
import type { LabelRead } from "../src/lib/vision.ts";

function labelFixture(overrides: Partial<LabelRead> = {}): LabelRead {
  return {
    name: "商品A",
    basis: "per_unit",
    basisLabel: "1食（80g）あたり",
    gramsPerBasis: 80,
    kcal: 300,
    proteinG: 20.5,
    fatG: 5,
    carbG: 40,
    saltG: 1.2,
    confidence: "high",
    notes: "",
    ...overrides,
  };
}

test("photoLabel.unitLabelFromBasisLabel: 表記から「1食」「2.5切れ」のような単位を拾う。拾えなければ null", () => {
  assert.equal(unitLabelFromBasisLabel("1食（80g）あたり"), "1食");
  assert.equal(unitLabelFromBasisLabel("1個あたり"), "1個");
  assert.equal(unitLabelFromBasisLabel("2.5切れあたり"), "2.5切れ");
  assert.equal(unitLabelFromBasisLabel("１袋あたり"), "1袋");
  assert.equal(unitLabelFromBasisLabel("1パック(200g)"), "1パック");
  assert.equal(unitLabelFromBasisLabel("3缶"), "3缶");
  assert.equal(unitLabelFromBasisLabel("100gあたり"), null);
  assert.equal(unitLabelFromBasisLabel("1包装あたり"), null);
  assert.equal(unitLabelFromBasisLabel(""), null);
});

test("photoLabel.formValuesFromLabel: 1 食あたり（per_unit）は表記から単位を拾い、グラム数は gramsPerBasis", () => {
  assert.deepEqual(formValuesFromLabel(labelFixture()), {
    name: "商品A",
    category: "その他",
    unitLabel: "1食",
    basisKind: "unit",
    gramsPerUnit: "80",
    bagGrams: "",
    kcal: "300",
    proteinG: "20.5",
    fatG: "5",
    carbG: "40",
    saltG: "1.2",
    source: "label",
  });
  // 単位が拾えず、グラム数も無いときは「1食」・空欄
  const bare = formValuesFromLabel(
    labelFixture({ basisLabel: "あたり", gramsPerBasis: null }),
  );
  assert.equal(bare.unitLabel, "1食");
  assert.equal(bare.gramsPerUnit, "");
});

test("photoLabel.formValuesFromLabel: 100g あたり（per_100g）は 1 単位 = 100g で登録する", () => {
  const values = formValuesFromLabel(
    labelFixture({
      basis: "per_100g",
      basisLabel: "100gあたり",
      gramsPerBasis: 100,
    }),
  );
  assert.equal(values.basisKind, "per100g");
  assert.equal(values.unitLabel, "100g");
  assert.equal(values.gramsPerUnit, "100");
});

test("photoLabel.formValuesFromLabel: 1 袋あたり（per_package）は 1 袋を 1 単位にする", () => {
  const values = formValuesFromLabel(
    labelFixture({
      basis: "per_package",
      basisLabel: "1袋あたり",
      gramsPerBasis: 51,
    }),
  );
  assert.equal(values.basisKind, "unit");
  assert.equal(values.unitLabel, "1袋");
  assert.equal(values.gramsPerUnit, "51");
  assert.equal(values.bagGrams, "");

  // 表記に単位があればそちらを使う（今の出力）。商品名が無い・値が読めない項目は空欄
  const empty = formValuesFromLabel(
    labelFixture({
      basis: "per_package",
      basisLabel: "1パック(200g)あたり",
      gramsPerBasis: null,
      name: null,
      kcal: null,
      proteinG: null,
      fatG: null,
      carbG: null,
      saltG: null,
    }),
  );
  assert.deepEqual(empty, {
    name: "",
    category: "その他",
    unitLabel: "1パック",
    basisKind: "unit",
    gramsPerUnit: "",
    bagGrams: "",
    kcal: "",
    proteinG: "",
    fatG: "",
    carbG: "",
    saltG: "",
    source: "label",
  });
});

test("photoLabel.labelNotice: 自信が低いときと但し書きがあるときだけ文を返す", () => {
  assert.equal(labelNotice(labelFixture()), null);
  assert.equal(
    labelNotice(labelFixture({ confidence: "medium", notes: "   " })),
    null,
  );
  assert.equal(
    labelNotice(labelFixture({ confidence: "low" })),
    "読み取りに自信がありません。ラベルと見比べてください。",
  );
  assert.equal(
    labelNotice(labelFixture({ notes: "  ナトリウムから換算  " })),
    "ナトリウムから換算",
  );
  assert.equal(
    labelNotice(labelFixture({ confidence: "low", notes: "ぼやけている" })),
    "読み取りに自信がありません。ラベルと見比べてください。\nぼやけている",
  );
});
