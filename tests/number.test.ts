/**
 * 数値の丸めと文字列化（lib/number.ts）。
 *
 * 丸めは Math.round 系の 1 つだけ（toFixed は使わない）。負のゼロは 0 にする。
 * たんぱく質・脂質・炭水化物・塩分・kg・数量・回数の表示は、小数第 2 位で丸めた値をそのまま文字列にする（formatNumber）。
 * 値は架空のサンプル。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addRounded,
  formatFixed,
  formatNumber,
  round2,
  round3,
  roundTo,
} from "../src/lib/number.ts";

/** 負のゼロは String(-0) が '0' になって見分けられないので、Object.is で正のゼロかを調べる */
function isPositiveZero(n: number): boolean {
  return Object.is(n, 0);
}

test("number.round2 / round3 / roundTo: Math.round 系（2.675 は 2.68、1.005 は 1。2 進数の誤差どおり）", () => {
  assert.equal(round2(2.675), 2.68);
  assert.equal(round2(1.005), 1);
  assert.equal(round2(84.85), 84.85);
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(0.005), 0.01);
  assert.equal(round2(-0.4), -0.4);
  assert.equal(round2(1234.5678), 1234.57);

  assert.equal(round3(1.23456), 1.235);
  assert.equal(round3(10 / 3), 3.333);
  assert.equal(round3(0.0004), 0);

  assert.equal(roundTo(2.5, 0), 3);
  assert.equal(roundTo(1234.56, 1), 1234.6);
  assert.equal(roundTo(7, 2), 7);
});

test("number: 負のゼロは 0 にする（round2・round3・roundTo・addRounded）", () => {
  assert.ok(isPositiveZero(round2(-0.004)));
  assert.ok(isPositiveZero(round2(-0)));
  assert.ok(isPositiveZero(round3(-0.0004)));
  assert.ok(isPositiveZero(roundTo(-0.4, 0)));
  assert.ok(isPositiveZero(addRounded(-0.004, 0)));
  // 負の値そのものは残る
  assert.equal(round2(-0.04), -0.04);
});

test("number.addRounded: 足してから小数第 2 位で丸める（0.1 + 0.2 は 0.3）", () => {
  assert.equal(addRounded(0.1, 0.2), 0.3);
  assert.equal(addRounded(80, 3.5), 83.5);
  assert.equal(addRounded(2.675, 0), 2.68);
  assert.equal(addRounded(12.5, 1.25), 13.75);
});

test("number.formatNumber: 丸めた値をそのまま文字列にする。末尾の 0 は付かず、桁区切りも付けず、-0 は '0'", () => {
  assert.equal(formatNumber(140), "140");
  assert.equal(formatNumber(1.5), "1.5");
  assert.equal(formatNumber(2.675), "2.68");
  assert.equal(formatNumber(84.85), "84.85");
  assert.equal(formatNumber(0.1 + 0.2), "0.3");
  assert.equal(formatNumber(1234.5), "1234.5");
  assert.equal(formatNumber(-0.4), "-0.4");
  assert.equal(formatNumber(-0), "0");
  assert.equal(formatNumber(-0.004), "0");
});

test("number.formatNumber: 桁数を指定できる（体組成の kg・% は小数第 1 位）", () => {
  assert.equal(formatNumber(65.44, 1), "65.4");
  assert.equal(formatNumber(65, 1), "65");
  assert.equal(formatNumber(22.46, 1), "22.5");
  assert.equal(formatNumber(0.04, 1), "0");
  assert.equal(formatNumber(-0.04, 1), "0");
});

test("number.formatFixed: 桁をそろえる（末尾の 0 を残す）", () => {
  assert.equal(formatFixed(2, 1), "2.0");
  assert.equal(formatFixed(0, 1), "0.0");
  assert.equal(formatFixed(-0, 1), "0.0");
  assert.equal(formatFixed(12.34, 1), "12.3");
  assert.equal(formatFixed(36, 1), "36.0");
  assert.equal(formatFixed(60.5, 1), "60.5");
  assert.equal(formatFixed(0.5, 3), "0.500");
  assert.equal(formatFixed(1234, 0), "1234");
});
