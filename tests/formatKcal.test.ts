/**
 * kcal の表示桁。
 *
 * 以前、行の kcal まで整数に丸めたため、118.6 kcal の行が 2 本ある日に
 * 行は「119」「119」なのに合計は「237」と出て、行の和と合計が食い違って見えた。
 * 行は小数第 1 位まで、合計と進捗バーは整数、という分担をここで固定する。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtKcal, fmtKcalItem, fmtStored } from '../src/lib/formatKcal.ts';
import { buildBars, formatAmount } from '../src/lib/goals.ts';
import { scaleNutrition, sumNutrition } from '../src/lib/nutrition.ts';
import type { Settings } from '../src/db/types.ts';

test('行の kcal は小数第 1 位まで出し、.0 は出さない', () => {
  assert.equal(fmtKcalItem(118.6), '118.6');
  assert.equal(fmtKcalItem(119.0), '119');
  assert.equal(fmtKcalItem(118.55), '118.6');
  assert.equal(fmtKcalItem(72.2), '72.2');
  assert.equal(fmtKcalItem(1300), '1,300');
  assert.equal(fmtKcalItem(null), '—');
});

test('-0 と、丸めて 0 になる負の値は「0」と出す', () => {
  assert.equal(fmtKcalItem(-0), '0');
  assert.equal(fmtKcalItem(-0.04), '0');
  assert.equal(fmtKcal(-0), '0');
  assert.equal(fmtKcal(-0.4), '0');
  assert.equal(fmtStored(-0), '0');
  // 丸めても 0 にならない負の値は符号を残す
  assert.equal(fmtKcalItem(-0.06), '-0.1');
});

test('合計は整数に丸めて桁区切りを付ける', () => {
  assert.equal(fmtKcal(237.2), '237');
  assert.equal(fmtKcal(1234.5), '1,235');
  assert.equal(fmtKcal(14600), '14,600');
  assert.equal(fmtKcal(null), '—');
});

test('118.6 kcal の行が 2 本の日: 行は 118.6・118.6、合計は 237', () => {
  const per = { kcal: 118.6, proteinG: 21.7, fatG: 1.8, carbG: 4.7, saltG: 0.11 };
  const rows = [scaleNutrition(per, 1), scaleNutrition(per, 1)];
  assert.deepEqual(
    rows.map((row) => fmtKcalItem(row.kcal)),
    ['118.6', '118.6'],
  );
  const total = sumNutrition(rows);
  assert.equal(fmtKcal(total.value.kcal), '237');
});

test('進捗バーの kcal は整数・桁区切り（lib/goals.ts）', () => {
  assert.equal(formatAmount('kcal', 237.2), '237');
  assert.equal(formatAmount('kcal', 2000), '2,000');

  const per = { kcal: 118.6, proteinG: 21.7, fatG: 1.8, carbG: 4.7, saltG: 0.11 };
  const total = sumNutrition([scaleNutrition(per, 1), scaleNutrition(per, 1)]);
  const settings = {
    restDayKcal: 2000,
    gymDayKcal: 2200,
    proteinTargetG: 130,
    proteinCapG: 150,
    fatTargetG: 50,
    saltLimitG: 7,
  } as Settings;
  const kcalBar = buildBars(total, settings, 'rest').find((bar) => bar.key === 'kcal');
  assert.ok(kcalBar);
  assert.equal(kcalBar.valueText, '237 / 2,000 kcal');
  assert.equal(kcalBar.remainText, 'あと 1,763kcal');
});

test('開発用の表示（fmtStored）は保存値を丸めない', () => {
  assert.equal(fmtStored(118.55), '118.55');
  assert.equal(fmtStored(0.64), '0.64');
  assert.equal(fmtStored(14600), '14,600');
  assert.equal(fmtStored(null), '—');
});
