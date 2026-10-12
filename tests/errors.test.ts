/**
 * 例外から画面に出す文字列を取り出す（lib/errors.ts の errorMessage）。
 *
 * DB への保存の失敗などは、写真の読み取り用の文言（lib/photoError.ts）ではなく、例外そのものの message を出す。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { errorMessage } from "../src/lib/errors.ts";
import { photoErrorMessage } from "../src/lib/photoError.ts";

test("errors.errorMessage: Error は message、それ以外は String() の結果", () => {
  assert.equal(
    errorMessage(new Error("時刻が入っていません")),
    "時刻が入っていません",
  );
  assert.equal(errorMessage(new TypeError("型が違います")), "型が違います");
  assert.equal(errorMessage("文字列の例外"), "文字列の例外");
  assert.equal(errorMessage(42), "42");
  assert.equal(errorMessage(null), "null");
  assert.equal(errorMessage(undefined), "undefined");
});

test("errors.errorMessage: 写真用の文言には変換しない（photoErrorMessage との違い）", () => {
  const failure = new Error("QuotaExceededError: 端末の空き容量が足りません");
  assert.equal(
    errorMessage(failure),
    "QuotaExceededError: 端末の空き容量が足りません",
  );
  assert.equal(
    photoErrorMessage(failure),
    "読み取れませんでした。もう一度お試しください。",
  );
});
