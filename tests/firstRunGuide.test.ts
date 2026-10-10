/**
 * 初回の案内カードの表示判定。
 *
 * 案内カードは初回だけ出し、「閉じる」を押したら再読み込みしても二度と出さない。
 * 判定が逆になると、閉じたのに毎回出る（または一度も出ない）ので、保存値ごとの結果をここで固定する。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GUIDE_STORAGE_KEY,
  dismissedValue,
  shouldShowGuide,
} from "../src/lib/firstRunGuide.ts";

test("初回の案内: 保存値が無い（初回）なら出す", () => {
  assert.equal(shouldShowGuide(null), true);
});

test("初回の案内: 閉じたときの保存値が入っていれば出さない", () => {
  assert.equal(shouldShowGuide(dismissedValue()), false);
});

test("初回の案内: 閉じた印ではない値（空文字・別の値）なら出す", () => {
  assert.equal(shouldShowGuide(""), true);
  assert.equal(shouldShowGuide("shown"), true);
});

test("初回の案内: 保存値とキーは空ではない固定の文字列", () => {
  assert.equal(typeof dismissedValue(), "string");
  assert.notEqual(dismissedValue(), "");
  assert.equal(dismissedValue(), dismissedValue());
  assert.notEqual(GUIDE_STORAGE_KEY, "");
});
